import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  listGrainStorageReceipts,
  listGrainStorageUnits,
  queueGrainStorageReceipt,
  queueGrainStorageUnit,
  type GrainStorageReceiptState,
  type GrainStorageUnitState
} from "../application/storage/grain-storage-service";
import type {
  GrainStorageKind,
  GrainStorageProvenance,
  GrainStorageQuantityUnit
} from "../domain/storage/grain-storage";

interface GrainStorageProps {
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
  value: GrainStorageProvenance;
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

function formatQuantity(value: number, unit: GrainStorageQuantityUnit) {
  return (
    new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 3
    }).format(value) +
    " " +
    unit
  );
}

function kindLabel(kind: GrainStorageKind) {
  return kind === "silo" ? "Silo" : "Silobolsa";
}

export function GrainStorage({
  organizationId,
  actorId,
  deviceId,
  workSessionId,
  agriculturalOperationId,
  equipment,
  syncVersion,
  online,
  onPendingChanged
}: GrainStorageProps) {
  const [units, setUnits] = useState<GrainStorageUnitState[]>([]);
  const [receipts, setReceipts] = useState<GrainStorageReceiptState[]>([]);
  const [sourceEquipmentId, setSourceEquipmentId] = useState("");
  const [storageUnitId, setStorageUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<GrainStorageQuantityUnit>("t");
  const [provenance, setProvenance] =
    useState<GrainStorageProvenance>("estimated");
  const [note, setNote] = useState("");
  const [addingUnit, setAddingUnit] = useState(false);
  const [storageKind, setStorageKind] = useState<GrainStorageKind>("silo");
  const [storageName, setStorageName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const grainCarts = useMemo(
    () => equipment.filter((item) => item.role === "grain_cart"),
    [equipment]
  );

  const equipmentMap = useMemo(
    () => new Map(equipment.map((item) => [item.id, item])),
    [equipment]
  );

  const unitMap = useMemo(
    () => new Map(units.map((item) => [item.id, item])),
    [units]
  );

  async function refresh() {
    try {
      const [nextUnits, nextReceipts] = await Promise.all([
        listGrainStorageUnits(organizationId),
        listGrainStorageReceipts(organizationId, workSessionId)
      ]);
      setUnits(nextUnits);
      setReceipts(nextReceipts);
    } catch (error) {
      if (online) setMessage(messageOf(error));
    }
  }

  useEffect(() => {
    setQuantity("");
    setNote("");
    setAddingUnit(false);
    setMessage(undefined);
    void refresh();
  }, [workSessionId, syncVersion]);

  useEffect(() => {
    setSourceEquipmentId((current) =>
      grainCarts.some((item) => item.id === current)
        ? current
        : grainCarts[0]?.id ?? ""
    );
  }, [grainCarts]);

  useEffect(() => {
    const available = units.filter((item) => item.syncState !== "error");
    setStorageUnitId((current) =>
      available.some((item) => item.id === current)
        ? current
        : available[0]?.id ?? ""
    );
  }, [units]);

  async function handleAddUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);

    try {
      const command = await queueGrainStorageUnit({
        actorId,
        organizationId,
        deviceId,
        storageKind,
        displayName: storageName
      });

      setStorageName("");
      setAddingUnit(false);
      await onPendingChanged();
      await refresh();
      setStorageUnitId(command.payload.id);
      setMessage(
        online
          ? "Destino de almacenamiento preparado y enviado a sincronización."
          : "Destino de almacenamiento guardado offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);

    try {
      await queueGrainStorageReceipt({
        actorId,
        organizationId,
        deviceId,
        workSessionId,
        agriculturalOperationId,
        sourceEquipmentId,
        storageUnitId,
        quantityValue: Number(quantity.replace(",", ".")),
        quantityUnit: unit,
        provenance,
        receivedAt: new Date().toISOString(),
        note
      });

      setQuantity("");
      setNote("");
      await onPendingChanged();
      await refresh();
      setMessage(
        online
          ? "Descarga preparada y enviada a sincronización."
          : "Descarga guardada offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const availableUnits = units.filter((item) => item.syncState !== "error");

  return (
    <details className="grain-storage" open>
      <summary>
        <div>
          <span className="step">ALMACENAMIENTO</span>
          <strong>Silo / silobolsa</strong>
        </div>
        <span>{receipts.length}</span>
      </summary>

      <p className="grain-storage-intro">
        Registra el paso monotolva → almacenamiento. Mantiene el mismo lote de
        grano para conciliación posterior.
      </p>

      {grainCarts.length === 0 ? (
        <p className="empty-note">
          Se necesita una monotolva activa para registrar una descarga.
        </p>
      ) : (
        <>
          <div className="grain-storage-header">
            <strong>Destino</strong>
            <button
              type="button"
              onClick={() => setAddingUnit((value) => !value)}
            >
              {addingUnit ? "Cancelar" : "Agregar destino"}
            </button>
          </div>

          {addingUnit && (
            <form
              className="form-stack grain-storage-unit-form"
              onSubmit={(event) => void handleAddUnit(event)}
            >
              <label>
                Tipo
                <select
                  value={storageKind}
                  onChange={(event) =>
                    setStorageKind(event.target.value as GrainStorageKind)
                  }
                >
                  <option value="silo">Silo</option>
                  <option value="silobag">Silobolsa</option>
                </select>
              </label>

              <label>
                Nombre / identificación
                <input
                  value={storageName}
                  onChange={(event) => setStorageName(event.target.value)}
                  placeholder={
                    storageKind === "silo"
                      ? "Ej. Silo campo"
                      : "Ej. Silobolsa norte 1"
                  }
                  maxLength={120}
                  required
                />
              </label>

              <button disabled={busy} type="submit">
                {busy
                  ? "Guardando…"
                  : online
                    ? "Agregar destino"
                    : "Agregar destino offline"}
              </button>
            </form>
          )}

          {availableUnits.length > 0 ? (
            <form
              className="form-stack grain-storage-receipt-form"
              onSubmit={(event) => void handleReceipt(event)}
            >
              <label>
                Origen
                <select
                  value={sourceEquipmentId}
                  onChange={(event) =>
                    setSourceEquipmentId(event.target.value)
                  }
                  required
                >
                  {grainCarts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Destino
                <select
                  value={storageUnitId}
                  onChange={(event) => setStorageUnitId(event.target.value)}
                  required
                >
                  {availableUnits.map((storage) => (
                    <option key={storage.id} value={storage.id}>
                      {kindLabel(storage.storageKind)} · {storage.displayName}
                      {storage.syncState === "pending" ? " · pendiente" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="inline-grid">
                <label>
                  Cantidad
                  <input
                    inputMode="decimal"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    placeholder="Ej. 20"
                    required
                  />
                </label>

                <label>
                  Unidad
                  <select
                    value={unit}
                    onChange={(event) =>
                      setUnit(event.target.value as GrainStorageQuantityUnit)
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
                      event.target.value as GrainStorageProvenance
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
                  placeholder="Ej. descarga parcial"
                  maxLength={240}
                />
              </label>

              <button
                disabled={busy || !sourceEquipmentId || !storageUnitId}
                type="submit"
              >
                {busy
                  ? "Guardando…"
                  : online
                    ? "Registrar descarga"
                    : "Registrar descarga offline"}
              </button>
            </form>
          ) : (
            !addingUnit && (
              <p className="empty-note">
                Agregá un silo o silobolsa para registrar la primera descarga.
              </p>
            )
          )}
        </>
      )}

      {message && <p className="message">{message}</p>}

      {receipts.length > 0 && (
        <div className="grain-storage-list">
          {receipts.slice(0, 12).map((receipt) => {
            const source =
              equipmentMap.get(receipt.sourceEquipmentId)?.label ??
              "Monotolva";
            const storage = unitMap.get(receipt.storageUnitId);
            const destination = storage
              ? kindLabel(storage.storageKind) + " · " + storage.displayName
              : "Almacenamiento";

            return (
              <article key={receipt.id} className="grain-storage-row">
                <div>
                  <strong>{source} → {destination}</strong>
                  <span>
                    {formatQuantity(
                      receipt.quantityValue,
                      receipt.quantityUnit
                    )}
                    {" · "}
                    {formatMoment(receipt.receivedAt)}
                    {receipt.note ? " · " + receipt.note : ""}
                  </span>
                </div>
                <b className={"record-sync " + receipt.syncState}>
                  {receipt.syncState === "confirmed"
                    ? "CONFIRMADO"
                    : receipt.syncState === "pending"
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
