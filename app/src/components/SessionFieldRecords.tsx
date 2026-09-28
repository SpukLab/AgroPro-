import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  listSessionFieldRecords,
  queueHarvestDowntime,
  queueHarvestMeasurement,
  type SessionFieldRecord
} from "../application/harvest/session-record-service";
import type {
  DowntimeCause,
  HarvestMeasurementKind
} from "../domain/harvest/session-record";

interface SessionFieldRecordsProps {
  organizationId: string;
  actorId: string;
  deviceId: string;
  workSessionId: string;
  sessionStartedAt: string;
  equipment: Array<{ id: string; label: string }>;
  syncVersion: number;
  online: boolean;
  onPendingChanged: () => Promise<void>;
}

type Mode = "area" | "hours" | "fuel" | "downtime";

const causes: Array<{ value: DowntimeCause; label: string }> = [
  { value: "waiting_resource", label: "Espera de recurso" },
  { value: "breakdown", label: "Rotura / falla" },
  { value: "weather", label: "Clima" },
  { value: "logistics", label: "Logística" },
  { value: "maintenance", label: "Mantenimiento" },
  { value: "other", label: "Otro" }
];

function localDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}

function minutesBetween(startedAt: string, endedAt: string) {
  return Math.max(
    0,
    Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000
    )
  );
}

function formatMoment(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

const kindLabels: Record<HarvestMeasurementKind, string> = {
  area_completed_ha: "Superficie",
  machine_hours: "Horas máquina",
  fuel_liters: "Combustible"
};

export function SessionFieldRecords({
  organizationId,
  actorId,
  deviceId,
  workSessionId,
  sessionStartedAt,
  equipment,
  syncVersion,
  online,
  onPendingChanged
}: SessionFieldRecordsProps) {
  const [records, setRecords] = useState<SessionFieldRecord[]>([]);
  const [mode, setMode] = useState<Mode>("area");
  const [value, setValue] = useState("");
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [cause, setCause] = useState<DowntimeCause>("waiting_resource");
  const [downtimeStartedAt, setDowntimeStartedAt] = useState(
    localDateTimeInput(new Date())
  );
  const [downtimeEndedAt, setDowntimeEndedAt] = useState(
    localDateTimeInput(new Date())
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  async function refresh() {
    try {
      setRecords(await listSessionFieldRecords(organizationId, workSessionId));
    } catch (error) {
      if (online) setMessage(messageOf(error));
    }
  }

  useEffect(() => {
    setValue("");
    setNote("");
    setEquipmentId(equipment[0]?.id ?? "");
    const now = localDateTimeInput(new Date());
    setDowntimeStartedAt(now);
    setDowntimeEndedAt(now);
    void refresh();
  }, [workSessionId, syncVersion]);

  useEffect(() => {
    if (!equipmentId && equipment[0]?.id) {
      setEquipmentId(equipment[0].id);
    }
  }, [equipment, equipmentId]);

  const totals = useMemo(() => {
    let area = 0;
    let hours = 0;
    let fuel = 0;
    let downtimeMinutes = 0;

    for (const record of records) {
      if (record.recordType === "measurement") {
        if (record.kind === "area_completed_ha") area += record.value;
        if (record.kind === "machine_hours") hours += record.value;
        if (record.kind === "fuel_liters") fuel += record.value;
      } else {
        downtimeMinutes += minutesBetween(record.startedAt, record.endedAt);
      }
    }

    return { area, hours, fuel, downtimeMinutes };
  }, [records]);

  async function handleMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numericValue = Number(value.replace(",", "."));
    const kind: HarvestMeasurementKind =
      mode === "area"
        ? "area_completed_ha"
        : mode === "hours"
          ? "machine_hours"
          : "fuel_liters";

    setBusy(true);
    setMessage(undefined);

    try {
      await queueHarvestMeasurement({
        actorId,
        organizationId,
        deviceId,
        workSessionId,
        equipmentId: mode === "area" ? undefined : equipmentId,
        kind,
        value: numericValue,
        provenance: "manual",
        observedAt: new Date().toISOString(),
        note
      });
      setValue("");
      setNote("");
      await onPendingChanged();
      await refresh();
      setMessage(
        online
          ? "Registro preparado y enviado a sincronización."
          : "Registro guardado offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDowntime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);

    try {
      await queueHarvestDowntime({
        actorId,
        organizationId,
        deviceId,
        workSessionId,
        blockingEquipmentId:
          cause === "waiting_resource" ? equipmentId : undefined,
        cause,
        startedAt: new Date(downtimeStartedAt).toISOString(),
        endedAt: new Date(downtimeEndedAt).toISOString(),
        provenance: "manual",
        note
      });
      setNote("");
      await onPendingChanged();
      await refresh();
      setMessage(
        online
          ? "Parada preparada y enviada a sincronización."
          : "Parada guardada offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const needsEquipment = mode === "hours" || mode === "fuel";

  return (
    <details className="field-report" open>
      <summary>
        <div>
          <span className="step">PARTE DE JORNADA</span>
          <strong>Registro operativo</strong>
        </div>
        <span>{records.length}</span>
      </summary>

      <div className="field-report-totals">
        <div>
          <span>HECTÁREAS</span>
          <strong>{totals.area.toFixed(2)}</strong>
        </div>
        <div>
          <span>HORAS MÁQ.</span>
          <strong>{totals.hours.toFixed(1)}</strong>
        </div>
        <div>
          <span>COMBUSTIBLE</span>
          <strong>{totals.fuel.toFixed(1)} L</strong>
        </div>
        <div>
          <span>PARADAS</span>
          <strong>{totals.downtimeMinutes} min</strong>
        </div>
      </div>

      <div className="field-report-modes">
        <button
          className={mode === "area" ? "active" : ""}
          type="button"
          onClick={() => setMode("area")}
        >
          Hectáreas
        </button>
        <button
          className={mode === "hours" ? "active" : ""}
          type="button"
          onClick={() => setMode("hours")}
        >
          Horas
        </button>
        <button
          className={mode === "fuel" ? "active" : ""}
          type="button"
          onClick={() => setMode("fuel")}
        >
          Combustible
        </button>
        <button
          className={mode === "downtime" ? "active" : ""}
          type="button"
          onClick={() => setMode("downtime")}
        >
          Parada
        </button>
      </div>

      {mode !== "downtime" ? (
        <form className="form-stack field-report-form" onSubmit={(event) => void handleMeasurement(event)}>
          {needsEquipment && (
            <label>
              Recurso
              <select
                value={equipmentId}
                onChange={(event) => setEquipmentId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Seleccionar equipo
                </option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            {mode === "area"
              ? "Hectáreas realizadas"
              : mode === "hours"
                ? "Horas de máquina"
                : "Litros utilizados"}
            <input
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={mode === "area" ? "Ej. 24,5" : mode === "hours" ? "Ej. 3,2" : "Ej. 120"}
              required
            />
          </label>

          <label>
            Nota opcional
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={240}
              placeholder="Observación de campo"
            />
          </label>

          <button disabled={busy || (needsEquipment && !equipmentId)} type="submit">
            {busy ? "Guardando…" : online ? "Registrar" : "Registrar offline"}
          </button>
        </form>
      ) : (
        <form className="form-stack field-report-form" onSubmit={(event) => void handleDowntime(event)}>
          <label>
            Motivo
            <select
              value={cause}
              onChange={(event) => setCause(event.target.value as DowntimeCause)}
            >
              {causes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {cause === "waiting_resource" && (
            <label>
              Recurso que bloquea
              <select
                value={equipmentId}
                onChange={(event) => setEquipmentId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Seleccionar recurso
                </option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="inline-grid">
            <label>
              Desde
              <input
                type="datetime-local"
                min={localDateTimeInput(new Date(sessionStartedAt))}
                value={downtimeStartedAt}
                onChange={(event) => setDowntimeStartedAt(event.target.value)}
                required
              />
            </label>
            <label>
              Hasta
              <input
                type="datetime-local"
                min={downtimeStartedAt}
                value={downtimeEndedAt}
                onChange={(event) => setDowntimeEndedAt(event.target.value)}
                required
              />
            </label>
          </div>

          <label>
            Nota opcional
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={240}
              placeholder="Ej. esperando monotolva"
            />
          </label>

          <button
            disabled={busy || (cause === "waiting_resource" && !equipmentId)}
            type="submit"
          >
            {busy ? "Guardando…" : online ? "Registrar parada" : "Registrar parada offline"}
          </button>
        </form>
      )}

      {message && <p className="message">{message}</p>}

      {records.length > 0 && (
        <div className="field-record-list">
          {records.slice(0, 10).map((record) => (
            <article key={record.id} className="field-record-row">
              <div>
                <strong>
                  {record.recordType === "measurement"
                    ? `${kindLabels[record.kind]} · ${record.value} ${record.unit}`
                    : `Parada · ${minutesBetween(record.startedAt, record.endedAt)} min`}
                </strong>
                <span>
                  {record.recordType === "measurement"
                    ? formatMoment(record.observedAt)
                    : `${formatMoment(record.startedAt)} → ${formatMoment(record.endedAt)}`}
                  {record.note ? ` · ${record.note}` : ""}
                </span>
              </div>
              <b className={`record-sync ${record.syncState}`}>
                {record.syncState === "confirmed"
                  ? "CONFIRMADO"
                  : record.syncState === "pending"
                    ? "PENDIENTE"
                    : "ERROR"}
              </b>
            </article>
          ))}
        </div>
      )}
    </details>
  );
}
