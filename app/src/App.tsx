import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  getCurrentSession,
  signInWithEmail,
  signOut,
  signUpWithEmail
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
import "./styles.css";

type AuthMode = "signin" | "signup";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado";
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string>();
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string>();
  const [organizationName, setOrganizationName] = useState("");
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string>();
  const [pending, setPending] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>();
  const [online, setOnline] = useState(navigator.onLine);
  const [deviceId] = useState(getOrCreateDeviceId);
  const bootstrapAttempt = useRef<BootstrapAttempt | null>(null);

  async function refreshPending() {
    setPending(await surkaraDb.outbox.where("status").equals("pending").count());
  }

  async function refreshMemberships() {
    if (!session) {
      setMemberships([]);
      setActiveOrganizationId(undefined);
      return;
    }

    setMembershipsLoading(true);
    try {
      const next = await listOrganizationMemberships();
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

    const subscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthMessage(undefined);
    });

    void refreshPending();

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      mounted = false;
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    void refreshMemberships().catch((error) => {
      setOnboardingMessage(errorMessage(error));
    });
  }, [session?.user.id]);

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

  async function handleSync() {
    setSyncBusy(true);
    setSyncMessage(undefined);

    try {
      const result = await syncReadyCommands(createSupabaseSyncTransport());
      await refreshPending();
      setSyncMessage(
        `Sync: ${result.accepted} aceptados · ${result.duplicate} duplicados · ${result.conflict} conflictos · ${result.technicalFailures} fallos técnicos`
      );
    } catch (error) {
      setSyncMessage(errorMessage(error));
    } finally {
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
            <button disabled={authBusy} type="submit">
              {authBusy
                ? "Procesando…"
                : authMode === "signin"
                  ? "Ingresar"
                  : "Crear cuenta"}
            </button>
          </form>

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
        <span className={online ? "status online" : "status offline"}>
          {online ? "ONLINE" : "OFFLINE"}
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

      <section className="hero">
        <p>Milestone A · backend Supabase activo</p>
        <strong>{pending}</strong>
        <span>comandos pendientes en este dispositivo</span>
      </section>

      <section className="grid">
        <article>
          <span>Acceso</span>
          <b>{activeOrganization?.role}</b>
        </article>
        <article>
          <span>Persistencia local</span>
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
      </section>

      <section className="card action-card">
        <div>
          <span className="step">SINCRONIZACIÓN</span>
          <h2>Outbox</h2>
          <p>
            Los comandos locales conservan su identidad durante reintentos y cortes de
            conexión.
          </p>
        </div>
        <button
          disabled={syncBusy || !online || pending === 0}
          onClick={() => void handleSync()}
        >
          {syncBusy ? "Sincronizando…" : "Sincronizar pendientes"}
        </button>
        {syncMessage && <p className="message">{syncMessage}</p>}
      </section>

      <section className="card next-card">
        <span className="step">ONBOARDING · 2/2</span>
        <h2>Contexto agronómico</h2>
        <p>
          El siguiente bloque crea establecimiento, lote y campaña para habilitar la
          primera operación de cosecha real.
        </p>
      </section>

      <button className="button-secondary" onClick={() => void handleSignOut()}>
        Cerrar sesión
      </button>
    </main>
  );
}
