import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  listTransportLoads,
  listTransportVehicles,
  queueTransportLoad,
  queueTransportVehicle,
  type TransportLoadState,
  type TransportVehicleState
} from "../application/transport/load-service";
import type {
  TransportLoadProvenance,
  TransportQuantityUnit
} from "../domain/transport/load";

interface TransportLoadsProps {
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
  value: TransportLoadProvenance;
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

function formatQuantity(value: number, unit: TransportQuantityUnit) {
  return (
    new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 3
    }).format(value) +
    " " +
    unit
  );
}

export function TransportLoads({
  organizationId,
  actorId,
  deviceId,
  workSessionId,
  agriculturalOperationId,
  equipment,
  syncVersion,
  online,
  onPendingChanged
}: TransportLoadsProps) {
  const [vehicles, setVehicles] = useState<TransportVehicleState[]>([]);
  const [loads, setLoads] = useState<TransportLoadState[]>([]);
  const [sourceEquipmentId, setSourceEquipmentId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<TransportQuantityUnit>("t");
  const [provenance, setProvenance] =
    useState<TransportLoadProvenance>("estimated");
  const [note, setNote] = useState("");
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [vehicleName, setVehicleName] = useState("");
  const [plate, setPlate] = useState("");
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

  const vehicleMap = useMemo(
    () => new Map(vehicles.map((item) => [item.id, item])),
    [vehicles]
  );

  async function refresh() {
    try {
      const [nextVehicles, nextLoads] = await Promise.all([
        listTransportVehicles(organizationId),
        listTransportLoads(organizationId, workSessionId)
      ]);
      setVehicles(nextVehicles);
      setLoads(nextLoads);
    } catch (error) {
      if (online) setMessage(messageOf(error));
    }
  }

  useEffect(() => {
    setQuantity("");
    setNote("");
    setAddingVehicle(false);
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
    const available = vehicles.filter((item) => item.syncState !== "error");
    setVehicleId((current) =>
      available.some((item) => item.id === current)
        ? current
        : available[0]?.id ?? ""
    );
  }, [vehicles]);

  async function handleAddVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);

    try {
      const command = await queueTransportVehicle({
        actorId,
        organizationId,
        deviceId,
        displayName: vehicleName,
        plate
      });

      setVehicleName("");
      setPlate("");
      setAddingVehicle(false);
      await onPendingChanged();
      await refresh();
      setVehicleId(command.payload.id);
      setMessage(
        online
          ? "Camión preparado y enviado a sincronización."
          : "Camión guardado offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleLoad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);

    try {
      await queueTransportLoad({
        actorId,
        organizationId,
        deviceId,
        workSessionId,
        agriculturalOperationId,
        sourceEquipmentId,
        vehicleId,
        quantityValue: Number(quantity.replace(",", ".")),
        quantityUnit: unit,
        provenance,
        loadedAt: new Date().toISOString(),
        note
      });

      setQuantity("");
      setNote("");
      await onPendingChanged();
      await refresh();
      setMessage(
        online
          ? "Carga preparada y enviada a sincronización."
          : "Carga guardada offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const availableVehicles = vehicles.filter(
    (item) => item.syncState !== "error"
  );

  return (
    <details className="transport-loads">
      <summary>
        <div>
          <span className="step">SALIDA DE GRANO</span>
          <strong>Carga a camión</strong>
        </div>
        <span>{loads.length}</span>
      </summary>

      <p className="transport-loads-intro">
        Registra el paso monotolva → camión. El viaje, chofer, destino,
        descarga y documentación se agregan en el módulo Transporte.
      </p>

      {grainCarts.length === 0 ? (
        <p className="empty-note">
          Se necesita una monotolva activa para cargar un camión.
        </p>
      ) : (
        <>
          <div className="transport-vehicle-header">
            <strong>Camión</strong>
            <button
              type="button"
              onClick={() => setAddingVehicle((value) => !value)}
            >
              {addingVehicle ? "Cancelar" : "Agregar camión"}
            </button>
          </div>

          {addingVehicle && (
            <form
              className="form-stack transport-vehicle-form"
              onSubmit={(event) => void handleAddVehicle(event)}
            >
              <label>
                Nombre / identificación
                <input
                  value={vehicleName}
                  onChange={(event) => setVehicleName(event.target.value)}
                  placeholder="Ej. Camión 12"
                  maxLength={120}
                  required
                />
              </label>

              <label>
                Patente opcional
                <input
                  value={plate}
                  onChange={(event) => setPlate(event.target.value)}
                  placeholder="Ej. AA123BB"
                  maxLength={20}
                  autoCapitalize="characters"
                />
              </label>

              <button disabled={busy} type="submit">
                {busy
                  ? "Guardando…"
                  : online
                    ? "Agregar camión"
                    : "Agregar camión offline"}
              </button>
            </form>
          )}

          {availableVehicles.length > 0 ? (
            <form
              className="form-stack transport-load-form"
              onSubmit={(event) => void handleLoad(event)}
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
                Camión destino
                <select
                  value={vehicleId}
                  onChange={(event) => setVehicleId(event.target.value)}
                  required
                >
                  {availableVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.displayName}
                      {vehicle.plate ? " · " + vehicle.plate : ""}
                      {vehicle.syncState === "pending" ? " · pendiente" : ""}
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
                    placeholder="Ej. 28,5"
                    required
                  />
                </label>

                <label>
                  Unidad
                  <select
                    value={unit}
                    onChange={(event) =>
                      setUnit(event.target.value as TransportQuantityUnit)
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
                      event.target.value as TransportLoadProvenance
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
                  placeholder="Ej. primera carga"
                  maxLength={240}
                />
              </label>

              <button
                disabled={busy || !sourceEquipmentId || !vehicleId}
                type="submit"
              >
                {busy
                  ? "Guardando…"
                  : online
                    ? "Registrar carga"
                    : "Registrar carga offline"}
              </button>
            </form>
          ) : (
            !addingVehicle && (
              <p className="empty-note">
                Agregá un camión para registrar la primera carga.
              </p>
            )
          )}
        </>
      )}

      {message && <p className="message">{message}</p>}

      {loads.length > 0 && (
        <div className="transport-load-list">
          {loads.slice(0, 12).map((load) => {
            const source =
              equipmentMap.get(load.sourceEquipmentId)?.label ?? "Monotolva";
            const vehicle =
              vehicleMap.get(load.vehicleId)?.displayName ?? "Camión";

            return (
              <article key={load.id} className="transport-load-row">
                <div>
                  <strong>{source} → {vehicle}</strong>
                  <span>
                    {formatQuantity(load.quantityValue, load.quantityUnit)}
                    {" · "}
                    {formatMoment(load.loadedAt)}
                    {load.note ? " · " + load.note : ""}
                  </span>
                </div>
                <b className={"record-sync " + load.syncState}>
                  {load.syncState === "confirmed"
                    ? "CONFIRMADO"
                    : load.syncState === "pending"
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
