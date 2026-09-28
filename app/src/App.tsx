import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AgronomyWorkspace } from "./components/AgronomyWorkspace";
import {
  getCurrentSession,
  requestPasswordReset,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  updatePassword
} from "./application/auth/auth-service";
import {
  bootstrapOrganization,
  createBootstrapAttempt,
  listOrganizationMemberships,
  type BootstrapAttempt,
  type OrganizationMembership
} from "./application/organizations/organization-service";
import { syncReadyCommands } from "./application/sync/sync-engine";
import { getOrCreateDeviceId } from "./infra/device/device-id";
import { surkaraDb } from "./infra/local/db";
import { createSupabaseSyncTransport } from "./infra/supabase/sync-transport";
import { isSupabaseConfigured, supabase } from "./infra/supabase/client";
import {
  probeSyncGateway,
  type BackendReachability
} from "./infra/network/reachability";
import "./styles.css";

type AuthMode = "signin" | "signup" | "forgot";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado";
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string>();
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string>();
  const [organizationName, setOrganizationName] = useState("");
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string>();
  const [pending, setPending] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>();
  const [syncVersion, setSyncVersion] = useState(0);
  const [reachability, setReachability] = useState<BackendReachability>(
    navigator.onLine ? "checking" : "offline"
  );
  const [deviceId] = useState(getOrCreateDeviceId);
  const bootstrapAttempt = useRef<BootstrapAttempt | null>(null);
  const syncInFlight = useRef(false);
  const online = reachability === "online";

  async function refreshPending() {
    setPending(await surkaraDb.outbox.where("status").equals("pending").count());
  }

  async function refreshReachability(): Promise<boolean> {
    if (!navigator.onLine) {
      setReachability("offline");
      return false;
    }

    const reachable = await probeSyncGateway();
    setReachability(reachable ? "online" : "offline");
    return reachable;
  }

  async function refreshMemberships() {
    if (!session) {
      setMemberships([]);
      setActiveOrganizationId(undefined);
      return;
    }

    setMembershipsLoading(true);
    try {
      const next = await listOrganizationMemberships(session.user.id);
      setMemberships(next);
      setActiveOrganizationId((current) => {
        if (current && next.some((item) => item.organizationId === current)) {
          return current;
        }
        return next[0]?.organizationId;
      });
    } finally {
      setMembershipsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    void getCurrentSession()
      .then((current) => {
        if (mounted) setSession(current);
      })
      .catch((error) => {
        if (mounted) setAuthMessage(errorMessage(error));
      })
      .finally(() => {
        if (mounted) setSessionLoading(false);
      });

    const subscription = supabase?.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthMessage(undefined);
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
    });

    void refreshPending();
    void refreshReachability();

    const onOnline = () => void refreshReachability();
    const onOffline = () => setReachability("offline");
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshReachability();
      }
    };
    const reachabilityTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshReachability();
      }
    }, 30_000);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted = false;
      subscription?.data.subscription.unsubscribe();
      window.clearInterval(reachabilityTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    void refreshMemberships().catch((error) => {
      setOnboardingMessage(errorMessage(error));
    });
  }, [session?.user.id]);

  useEffect(() => {
    if (!session || pending === 0) return;

    let cancelled = false;

    const tryAutomaticSync = async () => {
      if (syncInFlight.current) return;
      const reachable = await refreshReachability();
      if (!cancelled && reachable) {
        await handleSync(true);
      }
    };

    void tryAutomaticSync();
    const retryTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void tryAutomaticSync();
      }
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(retryTimer);
    };
  }, [session?.user.id, pending]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage(undefined);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !email.includes("@")) {
      setAuthMessage("Ingresá un email válido.");
      return;
    }

    if (authMode === "forgot") {
      setAuthBusy(true);
      try {
        await requestPasswordReset(email);
        setAuthMessage(
          "Te enviamos un enlace para elegir una nueva contraseña. Revisá tu correo."
        );
      } catch (error) {
        setAuthMessage(errorMessage(error));
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    if (password.length < 8) {
      setAuthMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setAuthBusy(true);
    try {
      if (authMode === "signin") {
        const nextSession = await signInWithEmail(email, password);
        setSession(nextSession);
        return;
      }

      const result = await signUpWithEmail(email, password);
      if (result.needsEmailConfirmation) {
        setAuthMessage(
          "Cuenta creada. Revisá tu correo para confirmar el acceso antes de ingresar."
        );
      } else if (result.session) {
        setSession(result.session);
      }
    } catch (error) {
      setAuthMessage(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handlePasswordRecoverySubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setAuthMessage(undefined);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");

    if (password.length < 8) {
      setAuthMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmation) {
      setAuthMessage("Las contraseñas no coinciden.");
      return;
    }

    setAuthBusy(true);
    try {
      await updatePassword(password);
      setPasswordRecovery(false);
      setAuthMode("signin");
      setAuthMessage("Contraseña actualizada.");
    } catch (error) {
      setAuthMessage(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setAuthBusy(true);
    try {
      await signOut();
      bootstrapAttempt.current = null;
      setSession(null);
      setMemberships([]);
      setActiveOrganizationId(undefined);
      setOrganizationName("");
    } catch (error) {
      setAuthMessage(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleOrganizationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = organizationName.trim();

    if (normalizedName.length < 2 || normalizedName.length > 120) {
      setOnboardingMessage("El nombre debe tener entre 2 y 120 caracteres.");
      return;
    }

    if (
      !bootstrapAttempt.current ||
      bootstrapAttempt.current.organizationName !== normalizedName
    ) {
      bootstrapAttempt.current = createBootstrapAttempt(normalizedName);
    }

    setOnboardingBusy(true);
    setOnboardingMessage(undefined);

    try {
      const result = await bootstrapOrganization(bootstrapAttempt.current);

      if (result.status === "accepted" || result.status === "duplicate") {
        bootstrapAttempt.current = null;
        setOnboardingMessage("Organización creada y acceso owner confirmado.");
        await refreshMemberships();
        return;
      }

      if (
        result.errorCode === "already_onboarded" ||
        result.errorCode === "membership_already_exists"
      ) {
        bootstrapAttempt.current = null;
        await refreshMemberships();
        return;
      }

      setOnboardingMessage(
        `No se pudo completar el onboarding: ${result.errorCode ?? "rejected"}`
      );
    } catch (error) {
      setOnboardingMessage(
        `${errorMessage(error)}. Podés reintentar: SURKARA conservará el mismo intento.`
      );
    } finally {
      setOnboardingBusy(false);
    }
  }

  async function handleSync(automatic = false) {
    if (syncInFlight.current) return;

    syncInFlight.current = true;
    setSyncBusy(true);
    if (!automatic) setSyncMessage(undefined);

    try {
      const result = await syncReadyCommands(createSupabaseSyncTransport());
      await refreshPending();
      setSyncVersion((value) => value + 1);

      if (!automatic || result.attempted > 0) {
        setSyncMessage(
          `${automatic ? "Sync automático" : "Sync"}: ${result.accepted} aceptados · ${result.duplicate} duplicados · ${result.conflict} conflictos · ${result.technicalFailures} fallos técnicos`
        );
      }
    } catch (error) {
      setSyncMessage(
        automatic
          ? `Sync automático pendiente: ${errorMessage(error)}`
          : errorMessage(error)
      );
    } finally {
      syncInFlight.current = false;
      setSyncBusy(false);
    }
  }

  const activeOrganization = memberships.find(
    (item) => item.organizationId === activeOrganizationId
  );

  if (!isSupabaseConfigured) {
    return (
      <main className="shell centered">
        <section className="card">
          <span className="eyebrow">SURKARA</span>
          <h1>Configuración incompleta</h1>
          <p>Faltan las variables públicas de Supabase para iniciar la aplicación.</p>
        </section>
      </main>
    );
  }

  if (sessionLoading) {
    return (
      <main className="shell centered">
        <div className="loading-ring" aria-label="Cargando sesión" />
      </main>
    );
  }

  if (passwordRecovery && session) {
    return (
      <main className="shell auth-shell">
        <section className="auth-brand">
          <span className="eyebrow">SURKARA</span>
          <h1>Elegí una nueva contraseña.</h1>
          <p>
            El enlace de recuperación ya fue validado. Definí una contraseña nueva
            para continuar.
          </p>
        </section>

        <section className="card auth-card">
          <form
            className="form-stack"
            onSubmit={(event) => void handlePasswordRecoverySubmit(event)}
          >
            <label>
              Nueva contraseña
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label>
              Repetir contraseña
              <input
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <button disabled={authBusy} type="submit">
              {authBusy ? "Guardando…" : "Guardar nueva contraseña"}
            </button>
          </form>

          {authMessage && <p className="message">{authMessage}</p>}
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="shell auth-shell">
        <section className="auth-brand">
          <span className="eyebrow">SURKARA</span>
          <h1>Operaciones de campo, incluso sin señal.</h1>
          <p>
            Acceso seguro a la plataforma operacional. La sesión se conserva en este
            dispositivo; las reglas de acceso se validan en Supabase.
          </p>
        </section>

        <section className="card auth-card">
          {authMode !== "forgot" && (
            <div className="segmented" aria-label="Modo de acceso">
              <button
                className={authMode === "signin" ? "segment active" : "segment"}
                type="button"
                onClick={() => {
                  setAuthMode("signin");
                  setAuthMessage(undefined);
                }}
              >
                Ingresar
              </button>
              <button
                className={authMode === "signup" ? "segment active" : "segment"}
                type="button"
                onClick={() => {
                  setAuthMode("signup");
                  setAuthMessage(undefined);
                }}
              >
                Crear cuenta
              </button>
            </div>
          )}

          <form className="form-stack" onSubmit={(event) => void handleAuthSubmit(event)}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
              />
            </label>
            {authMode !== "forgot" && (
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                  minLength={8}
                  required
                />
              </label>
            )}
            <button disabled={authBusy} type="submit">
              {authBusy
                ? "Procesando…"
                : authMode === "signin"
                  ? "Ingresar"
                  : authMode === "signup"
                    ? "Crear cuenta"
                    : "Enviar enlace de recuperación"}
            </button>
          </form>

          {authMode === "signin" && (
            <button
              className="button-secondary"
              type="button"
              onClick={() => {
                setAuthMode("forgot");
                setAuthMessage(undefined);
              }}
            >
              Olvidé mi contraseña
            </button>
          )}

          {authMode === "forgot" && (
            <button
              className="button-secondary"
              type="button"
              onClick={() => {
                setAuthMode("signin");
                setAuthMessage(undefined);
              }}
            >
              Volver a ingresar
            </button>
          )}

          {authMessage && <p className="message">{authMessage}</p>}
        </section>
      </main>
    );
  }

  if (membershipsLoading) {
    return (
      <main className="shell centered">
        <div className="loading-ring" aria-label="Cargando organización" />
      </main>
    );
  }

  if (memberships.length === 0) {
    return (
      <main className="shell">
        <header>
          <div>
            <span className="eyebrow">SURKARA</span>
            <h1>Primera organización</h1>
          </div>
          <button className="button-secondary compact" onClick={() => void handleSignOut()}>
            Salir
          </button>
        </header>

        <section className="card onboarding-card">
          <span className="step">ONBOARDING · 1/2</span>
          <h2>Creá tu espacio operacional</h2>
          <p>
            Esta organización será el límite inicial de seguridad y datos. Tu usuario
            quedará asociado como <strong>owner</strong>.
          </p>

          <form
            className="form-stack"
            onSubmit={(event) => void handleOrganizationSubmit(event)}
          >
            <label>
              Nombre de la empresa u organización
              <input
                value={organizationName}
                onChange={(event) => {
                  setOrganizationName(event.target.value);
                  if (
                    bootstrapAttempt.current &&
                    bootstrapAttempt.current.organizationName !== event.target.value.trim()
                  ) {
                    bootstrapAttempt.current = null;
                  }
                }}
                placeholder="Ej. Stepanosky Hermanos"
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <button disabled={onboardingBusy} type="submit">
              {onboardingBusy ? "Creando…" : "Crear organización"}
            </button>
          </form>

          {onboardingMessage && <p className="message">{onboardingMessage}</p>}

          <div className="technical-note">
            <span>Usuario</span>
            <b>{session.user.email ?? session.user.id}</b>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header>
        <div>
          <span className="eyebrow">SURKARA</span>
          <h1>Operaciones</h1>
        </div>
        <span className={`status ${reachability}`}>
          {reachability === "online"
            ? "ONLINE"
            : reachability === "checking"
              ? "COMPROBANDO"
              : "OFFLINE"}
        </span>
      </header>

      <section className="organization-bar">
        <div>
          <span>Organización activa</span>
          <strong>{activeOrganization?.organizationName}</strong>
        </div>
        {memberships.length > 1 && (
          <select
            value={activeOrganizationId}
            onChange={(event) => setActiveOrganizationId(event.target.value)}
          >
            {memberships.map((membership) => (
              <option
                key={membership.organizationId}
                value={membership.organizationId}
              >
                {membership.organizationName}
              </option>
            ))}
          </select>
        )}
      </section>

      <section className="ops-status-bar" aria-label="Estado operativo">
        <div className="ops-status-main">
          <span className={`status ${reachability}`}>
            {reachability === "online"
              ? "ONLINE"
              : reachability === "checking"
                ? "COMPROBANDO"
                : "OFFLINE"}
          </span>
          <div>
            <strong>{pending === 0 ? "Sincronizado" : `${pending} pendiente${pending === 1 ? "" : "s"}`}</strong>
            <span>
              {pending === 0
                ? "El dispositivo está al día."
                : "SURKARA conserva los cambios hasta poder enviarlos."}
            </span>
          </div>
        </div>
        {pending > 0 && (
          <button
            className="sync-compact-action"
            disabled={syncBusy || reachability !== "online"}
            onClick={() => void handleSync()}
          >
            {syncBusy ? "Sincronizando…" : "Sincronizar"}
          </button>
        )}
      </section>

      {syncMessage && <p className="message sync-inline-message">{syncMessage}</p>}

      <details className="system-panel">
        <summary>
          <span>Sistema y diagnóstico</span>
          <b>{activeOrganization?.role}</b>
        </summary>
        <div className="grid system-grid">
          <article>
            <span>Acceso</span>
            <b>{activeOrganization?.role}</b>
          </article>
          <article>
            <span>Persistencia</span>
            <b>IndexedDB</b>
          </article>
          <article>
            <span>Gateway</span>
            <b>JWT protegido</b>
          </article>
          <article>
            <span>Dispositivo</span>
            <b>{deviceId.slice(0, 8)}…</b>
          </article>
        </div>
        <div className="system-sync-note">
          <span>OUTBOX</span>
          <p>
            Los comandos locales conservan su identidad durante reintentos y cortes de conexión.
          </p>
        </div>
      </details>

      {activeOrganizationId && (
        <AgronomyWorkspace
          organizationId={activeOrganizationId}
          actorId={session.user.id}
          deviceId={deviceId}
          syncVersion={syncVersion}
          online={online}
          onPendingChanged={refreshPending}
        />
      )}

      <button className="button-secondary" onClick={() => void handleSignOut()}>
        Cerrar sesión
      </button>
    </main>
  );
}
