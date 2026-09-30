import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  listTransportDrivers,
  listTransportTrips,
  queueArriveTransportTrip,
  queueDepartTransportTrip,
  queueStartUnloadingTransportTrip,
  queueTransportDriver,
  queueTransportTrip,
  type TransportDriverState,
  type TransportTripState
} from "../application/transport/trip-service";
import {
  listTransportLoads,
  listTransportVehicles,
  type TransportLoadState,
  type TransportVehicleState
} from "../application/transport/load-service";

interface TransportTripsProps {
  organizationId: string;
  actorId: string;
  deviceId: string;
  workSessionId: string;
  originLabel: string;
  syncVersion: number;
  online: boolean;
  onPendingChanged: () => Promise<void>;
}

function localDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}

function formatMoment(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatQuantity(value: number, unit: string) {
  return (
    new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 3
    }).format(value) +
    " " +
    unit
  );
}

function statusLabel(status: TransportTripState["status"]) {
  switch (status) {
    case "loaded":
      return "CARGADO";
    case "departed":
      return "EN VIAJE";
    case "waiting":
      return "ESPERANDO";
    case "unloading":
      return "DESCARGANDO";
    case "delivered":
      return "ENTREGADO";
    case "closed":
      return "CERRADO";
    case "cancelled":
      return "CANCELADO";
  }
}

export function TransportTrips({
  organizationId,
  actorId,
  deviceId,
  workSessionId,
  originLabel,
  syncVersion,
  online,
  onPendingChanged
}: TransportTripsProps) {
  const [loads, setLoads] = useState<TransportLoadState[]>([]);
  const [vehicles, setVehicles] = useState<TransportVehicleState[]>([]);
  const [drivers, setDrivers] = useState<TransportDriverState[]>([]);
  const [trips, setTrips] = useState<TransportTripState[]>([]);
  const [loadId, setLoadId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [destinationLabel, setDestinationLabel] = useState("");
  const [plannedDepartureAt, setPlannedDepartureAt] = useState(
    localDateTimeInput(new Date())
  );
  const [addingDriver, setAddingDriver] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [licenseRef, setLicenseRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [lifecycleBusyId, setLifecycleBusyId] = useState<string>();
  const [message, setMessage] = useState<string>();

  const vehicleMap = useMemo(
    () => new Map(vehicles.map((item) => [item.id, item])),
    [vehicles]
  );

  const driverMap = useMemo(
    () => new Map(drivers.map((item) => [item.id, item])),
    [drivers]
  );

  const tripLoadIds = useMemo(
    () => new Set(trips.map((item) => item.loadId)),
    [trips]
  );

  const availableLoads = useMemo(
    () =>
      loads.filter(
        (item) =>
          item.syncState !== "error" &&
          !tripLoadIds.has(item.id)
      ),
    [loads, tripLoadIds]
  );

  const selectedLoad = useMemo(
    () => loads.find((item) => item.id === loadId),
    [loads, loadId]
  );

  async function refresh() {
    try {
      const [nextLoads, nextVehicles, nextDrivers, nextTrips] =
        await Promise.all([
          listTransportLoads(organizationId, workSessionId),
          listTransportVehicles(organizationId),
          listTransportDrivers(organizationId),
          listTransportTrips(organizationId, workSessionId)
        ]);

      setLoads(nextLoads);
      setVehicles(nextVehicles);
      setDrivers(nextDrivers);
      setTrips(nextTrips);
    } catch (error) {
      if (online) setMessage(messageOf(error));
    }
  }

  useEffect(() => {
    setDestinationLabel("");
    setPlannedDepartureAt(localDateTimeInput(new Date()));
    setAddingDriver(false);
    setMessage(undefined);
    void refresh();
  }, [workSessionId, syncVersion]);

  useEffect(() => {
    setLoadId((current) =>
      availableLoads.some((item) => item.id === current)
        ? current
        : availableLoads[0]?.id ?? ""
    );
  }, [availableLoads]);

  useEffect(() => {
    const availableDrivers = drivers.filter(
      (item) => item.syncState !== "error"
    );
    setDriverId((current) =>
      availableDrivers.some((item) => item.id === current)
        ? current
        : availableDrivers[0]?.id ?? ""
    );
  }, [drivers]);

  async function handleAddDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);

    try {
      const command = await queueTransportDriver({
        actorId,
        organizationId,
        deviceId,
        displayName: driverName,
        licenseRef
      });

      setDriverName("");
      setLicenseRef("");
      setAddingDriver(false);
      await onPendingChanged();
      await refresh();
      setDriverId(command.payload.id);
      setMessage(
        online
          ? "Chofer preparado y enviado a sincronización."
          : "Chofer guardado offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);

    try {
      await queueTransportTrip({
        actorId,
        organizationId,
        deviceId,
        workSessionId,
        loadId,
        driverId,
        originLabel,
        destinationLabel,
        plannedDepartureAt: new Date(plannedDepartureAt).toISOString()
      });

      setDestinationLabel("");
      setPlannedDepartureAt(localDateTimeInput(new Date()));
      await onPendingChanged();
      await refresh();
      setMessage(
        online
          ? "Viaje preparado y enviado a sincronización."
          : "Viaje guardado offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDepart(trip: TransportTripState) {
    setLifecycleBusyId(trip.id);
    setMessage(undefined);
    try {
      await queueDepartTransportTrip({
        actorId,
        organizationId,
        deviceId,
        workSessionId,
        tripId: trip.id,
        departedAt: new Date().toISOString()
      });
      await onPendingChanged();
      await refresh();
      setMessage(
        online ? "Salida enviada a sincronización." : "Salida guardada offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setLifecycleBusyId(undefined);
    }
  }

  async function handleArrive(trip: TransportTripState) {
    setLifecycleBusyId(trip.id);
    setMessage(undefined);
    try {
      await queueArriveTransportTrip({
        actorId,
        organizationId,
        deviceId,
        workSessionId,
        tripId: trip.id,
        arrivedAt: new Date().toISOString()
      });
      await onPendingChanged();
      await refresh();
      setMessage(
        online
          ? "Llegada y espera enviadas a sincronización."
          : "Llegada y espera guardadas offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setLifecycleBusyId(undefined);
    }
  }

  async function handleStartUnloading(trip: TransportTripState) {
    setLifecycleBusyId(trip.id);
    setMessage(undefined);
    try {
      await queueStartUnloadingTransportTrip({
        actorId,
        organizationId,
        deviceId,
        workSessionId,
        tripId: trip.id,
        unloadingStartedAt: new Date().toISOString()
      });
      await onPendingChanged();
      await refresh();
      setMessage(
        online
          ? "Inicio de descarga enviado a sincronización."
          : "Inicio de descarga guardado offline."
      );
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setLifecycleBusyId(undefined);
    }
  }

  const availableDrivers = drivers.filter(
    (item) => item.syncState !== "error"
  );

  return (
    <details className="transport-trips" open>
      <summary>
        <div>
          <span className="step">TRANSPORTE</span>
          <strong>Viajes</strong>
        </div>
        <span>{trips.length}</span>
      </summary>

      <p className="transport-trips-intro">
        Convierte una carga ya registrada en un viaje con camión, chofer,
        origen y destino. Los cambios posteriores de camión o chofer
        conservarán historial.
      </p>

      <div className="transport-driver-header">
        <strong>Chofer</strong>
        <button
          type="button"
          onClick={() => setAddingDriver((value) => !value)}
        >
          {addingDriver ? "Cancelar" : "Agregar chofer"}
        </button>
      </div>

      {addingDriver && (
        <form
          className="form-stack transport-driver-form"
          onSubmit={(event) => void handleAddDriver(event)}
        >
          <label>
            Nombre del chofer
            <input
              value={driverName}
              onChange={(event) => setDriverName(event.target.value)}
              placeholder="Ej. Juan Pérez"
              maxLength={120}
              required
            />
          </label>

          <label>
            Licencia / referencia opcional
            <input
              value={licenseRef}
              onChange={(event) => setLicenseRef(event.target.value)}
              placeholder="Ej. Lic. 123456"
              maxLength={40}
            />
          </label>

          <button disabled={busy} type="submit">
            {busy
              ? "Guardando…"
              : online
                ? "Agregar chofer"
                : "Agregar chofer offline"}
          </button>
        </form>
      )}

      {availableLoads.length === 0 ? (
        <p className="empty-note">
          No hay cargas sin viaje en esta jornada. Registrá primero una carga
          monotolva → camión.
        </p>
      ) : availableDrivers.length === 0 ? (
        !addingDriver && (
          <p className="empty-note">
            Agregá un chofer para preparar el primer viaje.
          </p>
        )
      ) : (
        <form
          className="form-stack transport-trip-form"
          onSubmit={(event) => void handleTrip(event)}
        >
          <label>
            Carga
            <select
              value={loadId}
              onChange={(event) => setLoadId(event.target.value)}
              required
            >
              {availableLoads.map((load) => {
                const vehicle = vehicleMap.get(load.vehicleId);
                return (
                  <option key={load.id} value={load.id}>
                    {vehicle?.displayName ?? "Camión"}
                    {" · "}
                    {formatQuantity(load.quantityValue, load.quantityUnit)}
                    {load.syncState === "pending" ? " · pendiente" : ""}
                  </option>
                );
              })}
            </select>
          </label>

          <div className="transport-trip-context">
            <div>
              <span>CAMIÓN</span>
              <strong>
                {selectedLoad
                  ? vehicleMap.get(selectedLoad.vehicleId)?.displayName ??
                    "Camión"
                  : "—"}
              </strong>
            </div>
            <div>
              <span>ORIGEN</span>
              <strong>{originLabel}</strong>
            </div>
          </div>

          <label>
            Chofer
            <select
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
              required
            >
              {availableDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.displayName}
                  {driver.licenseRef ? " · " + driver.licenseRef : ""}
                  {driver.syncState === "pending" ? " · pendiente" : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Destino
            <input
              value={destinationLabel}
              onChange={(event) => setDestinationLabel(event.target.value)}
              placeholder="Ej. Acopio Trenque Lauquen"
              maxLength={160}
              required
            />
          </label>

          <label>
            Salida prevista
            <input
              type="datetime-local"
              value={plannedDepartureAt}
              onChange={(event) =>
                setPlannedDepartureAt(event.target.value)
              }
              required
            />
          </label>

          <button
            disabled={busy || !loadId || !driverId || !destinationLabel.trim()}
            type="submit"
          >
            {busy
              ? "Guardando…"
              : online
                ? "Preparar viaje"
                : "Preparar viaje offline"}
          </button>
        </form>
      )}

      {message && <p className="message">{message}</p>}

      {trips.length > 0 && (
        <div className="transport-trip-list">
          {trips.slice(0, 12).map((trip) => {
            const vehicle =
              vehicleMap.get(trip.vehicleId)?.displayName ?? "Camión";
            const driver =
              driverMap.get(trip.driverId)?.displayName ?? "Chofer";

            return (
              <article key={trip.id} className="transport-trip-row">
                <div>
                  <strong>
                    {vehicle} → {trip.destinationLabel}
                  </strong>
                  <span>
                    {driver}
                    {" · "}
                    salida {formatMoment(trip.plannedDepartureAt)}
                  </span>
                </div>
                <div className="transport-trip-status">
                  <b>{statusLabel(trip.status)}</b>
                  <span className={"record-sync " + trip.syncState}>
                    {trip.syncState === "confirmed"
                      ? "CONFIRMADO"
                      : trip.syncState === "pending"
                        ? "PENDIENTE"
                        : "ERROR"}
                  </span>
                  {trip.status === "loaded" && (
                    <button
                      className="trip-lifecycle-action"
                      type="button"
                      disabled={lifecycleBusyId === trip.id}
                      onClick={() => void handleDepart(trip)}
                    >
                      {lifecycleBusyId === trip.id
                        ? "Guardando…"
                        : online
                          ? "Marcar salida"
                          : "Salida offline"}
                    </button>
                  )}
                  {trip.status === "departed" && (
                    <button
                      className="trip-lifecycle-action"
                      type="button"
                      disabled={lifecycleBusyId === trip.id}
                      onClick={() => void handleArrive(trip)}
                    >
                      {lifecycleBusyId === trip.id
                        ? "Guardando…"
                        : online
                          ? "Llegó / espera"
                          : "Llegada offline"}
                    </button>
                  )}
                  {trip.status === "waiting" && (
                    <button
                      className="trip-lifecycle-action"
                      type="button"
                      disabled={lifecycleBusyId === trip.id}
                      onClick={() => void handleStartUnloading(trip)}
                    >
                      {lifecycleBusyId === trip.id
                        ? "Guardando…"
                        : online
                          ? "Iniciar descarga"
                          : "Descarga offline"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </details>
  );
}
