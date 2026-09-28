import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  listGrainFlow,
  queueGrainTransfer,
  type GrainFlowSnapshot
} from "../application/harvest/grain-flow-service";
import type {
  GrainQuantityUnit,
  GrainTransferProvenance
} from "../domain/harvest/grain-flow";

interface GrainFlowProps {
  organizationId: string;
  actorId: string;
  deviceId: string;
  workSessionId: string;
  agriculturalOperationId: string;
  equipment: Array<{ id: string; label: string; role: string }>;
  syncVersion: number;
  online: boolean;
  onPendingChanged: () => Promise<void>;
}

const provenanceOptions: Array<{
  value: GrainTransferProvenance;
  label: string;
}> = [
  { value: "estimated", label: "Estimado" },
  { value: "manual", label: "Manual" },
  { value: "machine", label: "Lectura de máquina" },
  { value: "scale", label: "Pesado" }
];

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}

function formatMoment(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatQuantity(value: number, unit: GrainQuantityUnit) {
  return (
    new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 3
    }).format(value) +
    " " +
    unit
  );
}

export function GrainFlow({
  organizationId,
  actorId,
  deviceId,
  workSessionId,
  agriculturalOperationId,
  equipment,
  syncVersion,
  online,
  onPendingChanged
}: GrainFlowProps) {
  const [snapshot, setSnapshot] = useState<GrainFlowSnapshot>({
    transfers: []
  });
  const [sourceEquipmentId, setSourceEquipmentId] = useState("");
  const [destinationEquipmentId, setDestinationEquipmentId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<GrainQuantityUnit>("t");
  const [provenance, setProvenance] =
    useState<GrainTransferProvenance>("estimated");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const equipmentMap = useMemo(
    () => new Map(equipment.map((item) => [item.id, item])),
    [equipment]
  );

  async function refresh() {
    try {
      setSnapshot(await listGrainFlow(organizationId, workSessionId));
    } catch (error) {
      if (online) setMessage(messageOf(error));
    }
  }

  useEffect(() => {
    const harvester =
      equipment.find((item) => item.role === "harvester") ?? equipment[0];
    const grainCart =
      equipment.find((item) => item.role === "grain_cart") ??
      equipment.find((item) => item.id !== harvester?.id);

    setSourceEquipmentId(harvester?.id ?? "");
    setDestinationEquipmentId(grainCart?.id ?? "");
    setQuantity("");
    setNote("");
    setMessage(undefined);
    void refresh();
  }, [workSessionId, syncVersion]);

  useEffect(() => {
    if (!sourceEquipmentId && equipment[0]?.id) {
      setSourceEquipmentId(equipment[0].id);
    }

    if (
      !destinationEquipmentId ||
      destinationEquipmentId === sourceEquipmentId
    ) {
      const next =
        equipment.find(
          (item) =>
            item.role === "grain_cart" && item.id !== sourceEquipmentId
        ) ??
        equipment.find((item) => item.id !== sourceEquipmentId);

      setDestinationEquipmentId(next?.id ?? "");
    }
  }, [equipment, sourceEquipmentId, destinationEquipmentId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);

    try {
      const numericQuantity = Number(quantity.replace(",", "."));

      await queueGrainTransfer({
        actorId,
        organizationId,
        deviceId,
        workSessionId,
        agriculturalOperationId,
        sourceEquipmentId,
        destinationEquipmentId,
        quantityValue: numericQuantity,
        quantityUnit: unit,
        provenance,
        occurredAt: new Date().toISOString(),
        note
      });

      setQuantity("");
      setNote("");
      await onPendingChanged();
      await refresh();
      setMessage(
        online
          ? "Transferencia preparada y enviada a sincronización."
          : "Transferencia guardada offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const canTransfer =
    equipment.length >= 2 &&
    sourceEquipmentId.length > 0 &&
    destinationEquipmentId.length > 0 &&
    sourceEquipmentId !== destinationEquipmentId;

  return (
    <details className="grain-flow">
      <summary>
        <div>
          <span className="step">MOVIMIENTO DE GRANO</span>
          <strong>Transferencias</strong>
        </div>
        <span>{snapshot.transfers.length}</span>
      </summary>

      <div className="grain-flow-context">
        <div>
          <span>LOTE DE GRANO</span>
          <strong>
            {snapshot.batch
              ? snapshot.batch.syncState === "confirmed"
                ? "Confirmado"
                : snapshot.batch.syncState === "pending"
                  ? "Pendiente"
                  : "Error"
              : "Se crea con la primera transferencia"}
          </strong>
        </div>
        <p>
          Primera etapa: cosechadora ↔ monotolva/equipos del equipo activo.
          Camión, silo y silobolsa se incorporan con Load/Storage en el siguiente incremento.
        </p>
      </div>

      {equipment.length < 2 ? (
        <p className="empty-note">
          Se necesitan al menos dos recursos de maquinaria activos para registrar una transferencia.
        </p>
      ) : (
        <form
          className="form-stack grain-transfer-form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label>
            Origen
            <select
              value={sourceEquipmentId}
              onChange={(event) => setSourceEquipmentId(event.target.value)}
              required
            >
              {equipment.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Destino
            <select
              value={destinationEquipmentId}
              onChange={(event) =>
                setDestinationEquipmentId(event.target.value)
              }
              required
            >
              {equipment
                .filter((item) => item.id !== sourceEquipmentId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </select>
          </label>

          <div className="inline-grid grain-quantity-grid">
            <label>
              Cantidad
              <input
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="Ej. 8,5"
                required
              />
            </label>

            <label>
              Unidad
              <select
                value={unit}
                onChange={(event) =>
                  setUnit(event.target.value as GrainQuantityUnit)
                }
              >
                <option value="t">Toneladas</option>
                <option value="kg">Kilogramos</option>
              </select>
            </label>
          </div>

          <label>
            Origen del dato
            <select
              value={provenance}
              onChange={(event) =>
                setProvenance(
                  event.target.value as GrainTransferProvenance
                )
              }
            >
              {provenanceOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nota opcional
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={240}
              placeholder="Ej. descarga parcial"
            />
          </label>

          <button disabled={busy || !canTransfer} type="submit">
            {busy
              ? "Guardando…"
              : online
                ? "Registrar transferencia"
                : "Registrar transferencia offline"}
          </button>
        </form>
      )}

      {message && <p className="message">{message}</p>}

      {snapshot.transfers.length > 0 && (
        <div className="grain-transfer-list">
          {snapshot.transfers.slice(0, 12).map((transfer) => {
            const source =
              equipmentMap.get(transfer.sourceEquipmentId)?.label ??
              "Origen";
            const destination =
              equipmentMap.get(transfer.destinationEquipmentId)?.label ??
              "Destino";

            return (
              <article key={transfer.id} className="grain-transfer-row">
                <div>
                  <strong>{source} → {destination}</strong>
                  <span>
                    {formatQuantity(
                      transfer.quantityValue,
                      transfer.quantityUnit
                    )} · {formatMoment(transfer.occurredAt)}
                    {transfer.note ? " · " + transfer.note : ""}
                  </span>
                </div>
                <b className={"record-sync " + transfer.syncState}>
                  {transfer.syncState === "confirmed"
                    ? "CONFIRMADO"
                    : transfer.syncState === "pending"
                      ? "PENDIENTE"
                      : "ERROR"}
                </b>
              </article>
            );
          })}
        </div>
      )}
    </details>
  );
}
