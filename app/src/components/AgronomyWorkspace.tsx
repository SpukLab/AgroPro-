import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  createSetupAgronomyAttempt,
  listAgronomyContext,
  setupAgronomyContext,
  type AgronomyContext,
  type SetupAgronomyAttempt
} from "../application/agronomy/agronomy-context-service";
import {
  listHarvestOperations,
  queueHarvestOperation,
  type HarvestOperationReadModel
} from "../application/agronomy/harvest-service";

interface AgronomyWorkspaceProps {
  organizationId: string;
  actorId: string;
  deviceId: string;
  syncVersion: number;
  onPendingChanged: () => Promise<void>;
}

function defaultCampaign() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    name: `${year}/${String(year + 1).slice(-2)}`,
    startsOn: `${year}-07-01`,
    endsOn: `${year + 1}-06-30`
  };
}

function localDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}

export function AgronomyWorkspace({
  organizationId,
  actorId,
  deviceId,
  syncVersion,
  onPendingChanged
}: AgronomyWorkspaceProps) {
  const campaignDefaults = defaultCampaign();
  const [context, setContext] = useState<AgronomyContext>();
  const [contextBusy, setContextBusy] = useState(true);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string>();
  const [operations, setOperations] = useState<HarvestOperationReadModel[]>([]);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string>();
  const [establishmentName, setEstablishmentName] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [area, setArea] = useState("");
  const [campaignName, setCampaignName] = useState(campaignDefaults.name);
  const [campaignStartsOn, setCampaignStartsOn] = useState(campaignDefaults.startsOn);
  const [campaignEndsOn, setCampaignEndsOn] = useState(campaignDefaults.endsOn);
  const setupAttempt = useRef<{ fingerprint: string; attempt: SetupAgronomyAttempt }>();

  async function refreshContext() {
    setContextBusy(true);
    try {
      const next = await listAgronomyContext(organizationId);
      setContext(next);
    } catch (error) {
      setSetupMessage(messageOf(error));
    } finally {
      setContextBusy(false);
    }
  }

  async function refreshOperations() {
    try {
      setOperations(await listHarvestOperations(organizationId));
    } catch (error) {
      if (navigator.onLine) setOperationMessage(messageOf(error));
    }
  }

  useEffect(() => {
    setContext(undefined);
    setOperations([]);
    setupAttempt.current = undefined;
    void refreshContext();
  }, [organizationId]);

  useEffect(() => {
    if (context?.fields.length && context.campaigns.length) {
      void refreshOperations();
    }
  }, [organizationId, syncVersion, context?.fields.length, context?.campaigns.length]);

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nominalAreaHa = Number(area.replace(",", "."));
    if (!Number.isFinite(nominalAreaHa) || nominalAreaHa <= 0) {
      setSetupMessage("La superficie debe ser mayor a 0.");
      return;
    }

    if (new Date(campaignEndsOn).getTime() < new Date(campaignStartsOn).getTime()) {
      setSetupMessage("La campaña no puede terminar antes de comenzar.");
      return;
    }

    const input = {
      organizationId,
      deviceId,
      establishmentName: establishmentName.trim(),
      fieldName: fieldName.trim(),
      nominalAreaHa,
      campaignName: campaignName.trim(),
      campaignStartsOn,
      campaignEndsOn
    };
    const fingerprint = JSON.stringify(input);

    if (!setupAttempt.current || setupAttempt.current.fingerprint !== fingerprint) {
      setupAttempt.current = {
        fingerprint,
        attempt: createSetupAgronomyAttempt(input)
      };
    }

    setSetupBusy(true);
    setSetupMessage(undefined);

    try {
      const result = await setupAgronomyContext(setupAttempt.current.attempt);

      if (result.status === "accepted" || result.status === "duplicate") {
        setupAttempt.current = undefined;
        setSetupMessage("Contexto agronómico confirmado.");
        await refreshContext();
        return;
      }

      setSetupMessage(
        `No se pudo crear el contexto: ${result.errorCode ?? result.status}`
      );
    } catch (error) {
      setSetupMessage(
        `${messageOf(error)}. Reintentá sin cambiar los datos para conservar el mismo intento.`
      );
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleHarvest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context) return;

    const form = new FormData(event.currentTarget);
    const fieldId = String(form.get("fieldId") ?? "");
    const campaignId = String(form.get("campaignId") ?? "");
    const cropCode = String(form.get("cropCode") ?? "").trim();
    const plannedAreaHa = Number(String(form.get("plannedAreaHa") ?? "").replace(",", "."));
    const plannedFromRaw = String(form.get("plannedFrom") ?? "");
    const plannedToRaw = String(form.get("plannedTo") ?? "");

    if (!fieldId || !campaignId || !cropCode) {
      setOperationMessage("Completá lote, campaña y cultivo.");
      return;
    }

    if (!Number.isFinite(plannedAreaHa) || plannedAreaHa <= 0) {
      setOperationMessage("La superficie planificada debe ser mayor a 0.");
      return;
    }

    const plannedFrom = new Date(plannedFromRaw).toISOString();
    const plannedTo = new Date(plannedToRaw).toISOString();

    setOperationBusy(true);
    setOperationMessage(undefined);

    try {
      const command = await queueHarvestOperation({
        actorId,
        organizationId,
        deviceId,
        fieldId,
        campaignId,
        cropCode,
        plannedAreaHa,
        plannedFrom,
        plannedTo
      });

      await onPendingChanged();
      setOperationMessage(
        `Operación ${command.targetRef?.slice(0, 8)}… guardada localmente. Podés sincronizar cuando haya conexión.`
      );
    } catch (error) {
      setOperationMessage(messageOf(error));
    } finally {
      setOperationBusy(false);
    }
  }

  if (contextBusy) {
    return (
      <section className="card workspace-card">
        <span className="step">CONTEXTO AGRONÓMICO</span>
        <p>Cargando lote y campaña…</p>
      </section>
    );
  }

  const needsSetup = !context || context.fields.length === 0 || context.campaigns.length === 0;

  if (needsSetup) {
    return (
      <section className="card onboarding-card">
        <span className="step">ONBOARDING · 2/2</span>
        <h2>Contexto agronómico inicial</h2>
        <p>
          Este bloque crea una base mínima real para operar: establecimiento, lote y
          campaña. La escritura pasa por el backend y se confirma como una sola
          transacción.
        </p>

        <form className="form-stack" onSubmit={(event) => void handleSetup(event)}>
          <label>
            Establecimiento
            <input
              value={establishmentName}
              onChange={(event) => setEstablishmentName(event.target.value)}
              placeholder="Ej. Campo La Esperanza"
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <label>
            Lote
            <input
              value={fieldName}
              onChange={(event) => setFieldName(event.target.value)}
              placeholder="Ej. Lote Norte"
              maxLength={120}
              required
            />
          </label>
          <label>
            Superficie nominal (ha)
            <input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              inputMode="decimal"
              placeholder="180"
              required
            />
          </label>
          <label>
            Campaña
            <input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <div className="inline-grid">
            <label>
              Inicio
              <input
                type="date"
                value={campaignStartsOn}
                onChange={(event) => setCampaignStartsOn(event.target.value)}
                required
              />
            </label>
            <label>
              Fin
              <input
                type="date"
                value={campaignEndsOn}
                onChange={(event) => setCampaignEndsOn(event.target.value)}
                required
              />
            </label>
          </div>
          <button disabled={setupBusy} type="submit">
            {setupBusy ? "Guardando…" : "Crear contexto agronómico"}
          </button>
        </form>

        {setupMessage && <p className="message">{setupMessage}</p>}
      </section>
    );
  }

  const defaultField = context.fields[0];
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86_400_000);

  return (
    <>
      <section className="card workspace-card">
        <div className="workspace-heading">
          <div>
            <span className="step">CONTEXTO AGRONÓMICO</span>
            <h2>{defaultField.establishmentName}</h2>
          </div>
          <span className={context.source === "cache" ? "context-chip cached" : "context-chip"}>
            {context.source === "cache" ? "CACHE LOCAL" : "CONFIRMADO"}
          </span>
        </div>
        <p>
          {context.fields.length} lote(s) · {context.campaigns.length} campaña(s)
        </p>
      </section>

      <section className="card">
        <span className="step">NUEVA OPERACIÓN</span>
        <h2>Cosecha</h2>
        <p>
          Se guarda primero en IndexedDB. La falta de conexión no impide registrar la
          intención de trabajo.
        </p>

        <form className="form-stack" onSubmit={(event) => void handleHarvest(event)}>
          <label>
            Lote
            <select name="fieldId" defaultValue={defaultField.id}>
              {context.fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name} · {field.nominalAreaHa} ha
                </option>
              ))}
            </select>
          </label>

          <label>
            Campaña
            <select name="campaignId" defaultValue={context.campaigns[0].id}>
              {context.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>

          <div className="inline-grid">
            <label>
              Cultivo
              <input name="cropCode" placeholder="SOY" defaultValue="SOY" required />
            </label>
            <label>
              Superficie (ha)
              <input
                name="plannedAreaHa"
                inputMode="decimal"
                defaultValue={defaultField.nominalAreaHa}
                required
              />
            </label>
          </div>

          <div className="inline-grid">
            <label>
              Inicio previsto
              <input
                name="plannedFrom"
                type="datetime-local"
                defaultValue={localDateTimeInput(now)}
                required
              />
            </label>
            <label>
              Fin previsto
              <input
                name="plannedTo"
                type="datetime-local"
                defaultValue={localDateTimeInput(tomorrow)}
                required
              />
            </label>
          </div>

          <button disabled={operationBusy} type="submit">
            {operationBusy ? "Guardando…" : "Guardar operación offline"}
          </button>
        </form>

        {operationMessage && <p className="message">{operationMessage}</p>}
      </section>

      <section className="card">
        <span className="step">AUTORIDAD REMOTA</span>
        <h2>Operaciones confirmadas</h2>
        {operations.length === 0 ? (
          <p>Todavía no hay operaciones confirmadas en PostgreSQL.</p>
        ) : (
          <div className="operation-list">
            {operations.map((operation) => (
              <article className="operation-row" key={operation.id}>
                <div>
                  <strong>{operation.cropCode} · {operation.fieldName}</strong>
                  <span>{operation.campaignName} · {operation.plannedAreaHa} ha</span>
                </div>
                <span className="operation-status">{operation.status}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
