import type { OfflineCommand } from "../../domain/sync/types";
import {
  createTransportDriver,
  createTransportTrip,
  type TransportDriver,
  type TransportTrip,
  type TransportTripStatus
} from "../../domain/transport/trip";
import {
  listTransportLoads,
  listTransportVehicles,
  type TransportLoadState,
  type TransportVehicleState
} from "./load-service";
import { getEntityCache, putEntityCache } from "../../infra/local/cache";
import { enqueueCommand, getCommandStatus } from "../../infra/local/outbox";
import { supabase } from "../../infra/supabase/client";

export interface TransportDriverState extends TransportDriver {
  syncState: "confirmed" | "pending" | "error";
  commandId?: string;
}

export interface TransportTripState extends Omit<TransportTrip, "status" | "revision"> {
  status: TransportTripStatus;
  revision: number;
  syncState: "confirmed" | "pending" | "error";
  commandId?: string;
}

function common(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
}) {
  const now = new Date().toISOString();
  return {
    actorId: input.actorId,
    deviceId: input.deviceId,
    tenantScope: input.organizationId,
    occurredAtLocal: now,
    queuedAtLocal: now,
    conflictClass: "C" as const,
    evidenceRefs: [] as string[],
    schemaVersion: 1 as const
  };
}

function driverCacheKey(organizationId: string) {
  return `transport-drivers:v1:${organizationId}`;
}

function tripCacheKey(organizationId: string, workSessionId: string) {
  return `transport-trips:v1:${organizationId}:${workSessionId}`;
}

async function reconcileSyncState(
  syncState: "confirmed" | "pending" | "error",
  commandId?: string
) {
  if (syncState !== "pending" || !commandId) return syncState;

  const status = await getCommandStatus(commandId);
  if (
    !status ||
    status === "pending" ||
    status === "syncing" ||
    status === "pending_external"
  ) {
    return "pending" as const;
  }

  if (status === "accepted" || status === "duplicate") {
    return "confirmed" as const;
  }

  return "error" as const;
}

async function reconcileDrivers(drivers: TransportDriverState[]) {
  return Promise.all(
    drivers.map(async (driver) => ({
      ...driver,
      syncState: await reconcileSyncState(
        driver.syncState,
        driver.commandId
      )
    }))
  );
}

async function reconcileTrips(trips: TransportTripState[]) {
  return Promise.all(
    trips.map(async (trip) => ({
      ...trip,
      syncState: await reconcileSyncState(trip.syncState, trip.commandId)
    }))
  );
}

export async function queueTransportDriver(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  displayName: string;
  licenseRef?: string;
}): Promise<OfflineCommand<TransportDriver>> {
  const driver = createTransportDriver(input);
  const command: OfflineCommand<TransportDriver> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "transport.create_driver",
    targetRef: driver.id,
    payload: driver,
    dependencies: []
  };

  await enqueueCommand(command);

  const key = driverCacheKey(input.organizationId);
  const local =
    (await getEntityCache<TransportDriverState[]>(key)) ?? [];

  await putEntityCache(key, "transport-drivers", input.organizationId, [
    {
      ...driver,
      syncState: "pending",
      commandId: command.clientOperationId
    },
    ...local.filter((item) => item.id !== driver.id)
  ]);

  return command;
}

export async function listTransportDrivers(
  organizationId: string
): Promise<TransportDriverState[]> {
  const key = driverCacheKey(organizationId);
  const local = await reconcileDrivers(
    (await getEntityCache<TransportDriverState[]>(key)) ?? []
  );

  if (!supabase) {
    await putEntityCache(key, "transport-drivers", organizationId, local);
    return local;
  }

  try {
    const { data: driverRows, error: driverError } = await supabase
      .from("transport_drivers")
      .select("id, party_id, license_ref, status")
      .eq("organization_id", organizationId)
      .eq("status", "active");

    if (driverError) throw driverError;

    const partyIds = (driverRows ?? []).map((row) => row.party_id as string);
    const names = new Map<string, string>();

    if (partyIds.length > 0) {
      const { data: partyRows, error: partyError } = await supabase
        .from("parties")
        .select("id, display_name")
        .in("id", partyIds);

      if (partyError) throw partyError;
      for (const row of partyRows ?? []) {
        names.set(row.id as string, row.display_name as string);
      }
    }

    const remote: TransportDriverState[] = (driverRows ?? []).map((row) => ({
      id: row.id as string,
      displayName: names.get(row.party_id as string) ?? "Chofer",
      licenseRef: (row.license_ref as string | null) ?? undefined,
      status: row.status as "active",
      syncState: "confirmed"
    }));

    const remoteIds = new Set(remote.map((item) => item.id));
    const merged = [
      ...local.filter(
        (item) => !remoteIds.has(item.id) && item.syncState !== "confirmed"
      ),
      ...remote
    ].sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));

    await putEntityCache(key, "transport-drivers", organizationId, merged);
    return merged;
  } catch {
    await putEntityCache(key, "transport-drivers", organizationId, local);
    return local;
  }
}

async function findLoad(
  organizationId: string,
  workSessionId: string,
  loadId: string
): Promise<TransportLoadState | undefined> {
  const loads = await listTransportLoads(organizationId, workSessionId);
  return loads.find((item) => item.id === loadId);
}

async function findVehicle(
  organizationId: string,
  vehicleId: string
): Promise<TransportVehicleState | undefined> {
  const vehicles = await listTransportVehicles(organizationId);
  return vehicles.find((item) => item.id === vehicleId);
}

async function findDriver(
  organizationId: string,
  driverId: string
): Promise<TransportDriverState | undefined> {
  const drivers = await listTransportDrivers(organizationId);
  return drivers.find((item) => item.id === driverId);
}

export async function queueTransportTrip(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  workSessionId: string;
  loadId: string;
  driverId: string;
  originLabel: string;
  destinationLabel: string;
  plannedDepartureAt: string;
}): Promise<OfflineCommand<TransportTrip>> {
  const load = await findLoad(
    input.organizationId,
    input.workSessionId,
    input.loadId
  );

  if (!load || load.syncState === "error") {
    throw new Error("load is not available");
  }

  const [vehicle, driver] = await Promise.all([
    findVehicle(input.organizationId, load.vehicleId),
    findDriver(input.organizationId, input.driverId)
  ]);

  if (!vehicle || vehicle.syncState === "error") {
    throw new Error("vehicle is not available");
  }

  if (!driver || driver.syncState === "error") {
    throw new Error("driver is not available");
  }

  const trip = createTransportTrip({
    loadId: input.loadId,
    sourceWorkSessionId: input.workSessionId,
    vehicleId: load.vehicleId,
    driverId: input.driverId,
    originLabel: input.originLabel,
    destinationLabel: input.destinationLabel,
    plannedDepartureAt: input.plannedDepartureAt
  });

  const dependencies = [
    load.syncState === "pending" ? load.commandId : undefined,
    vehicle.syncState === "pending" ? vehicle.commandId : undefined,
    driver.syncState === "pending" ? driver.commandId : undefined
  ].filter((value): value is string => Boolean(value));

  const command: OfflineCommand<TransportTrip> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "transport.create_trip",
    targetRef: trip.id,
    payload: trip,
    dependencies
  };

  await enqueueCommand(command);

  const key = tripCacheKey(input.organizationId, input.workSessionId);
  const local =
    (await getEntityCache<TransportTripState[]>(key)) ?? [];

  await putEntityCache(key, "transport-trips", input.workSessionId, [
    {
      ...trip,
      syncState: "pending",
      commandId: command.clientOperationId
    },
    ...local.filter((item) => item.id !== trip.id)
  ]);

  return command;
}

export async function listTransportTrips(
  organizationId: string,
  workSessionId: string
): Promise<TransportTripState[]> {
  const key = tripCacheKey(organizationId, workSessionId);
  const local = await reconcileTrips(
    (await getEntityCache<TransportTripState[]>(key)) ?? []
  );

  if (!supabase) {
    await putEntityCache(key, "transport-trips", workSessionId, local);
    return local;
  }

  try {
    const { data: tripRows, error: tripError } = await supabase
      .from("transport_trips")
      .select(
        "id, load_id, source_work_session_id, origin_label, destination_label, planned_departure_at, status, revision"
      )
      .eq("organization_id", organizationId)
      .eq("source_work_session_id", workSessionId)
      .order("planned_departure_at", { ascending: false });

    if (tripError) throw tripError;

    const tripIds = (tripRows ?? []).map((row) => row.id as string);
    const vehicleByTrip = new Map<string, string>();
    const driverByTrip = new Map<string, string>();

    if (tripIds.length > 0) {
      const [
        { data: vehicleAssignments, error: vehicleError },
        { data: driverAssignments, error: driverError }
      ] = await Promise.all([
        supabase
          .from("transport_trip_vehicle_assignments")
          .select("trip_id, vehicle_id")
          .eq("organization_id", organizationId)
          .in("trip_id", tripIds)
          .is("valid_to", null),
        supabase
          .from("transport_trip_driver_assignments")
          .select("trip_id, driver_id")
          .eq("organization_id", organizationId)
          .in("trip_id", tripIds)
          .is("valid_to", null)
      ]);

      if (vehicleError) throw vehicleError;
      if (driverError) throw driverError;

      for (const row of vehicleAssignments ?? []) {
        vehicleByTrip.set(row.trip_id as string, row.vehicle_id as string);
      }
      for (const row of driverAssignments ?? []) {
        driverByTrip.set(row.trip_id as string, row.driver_id as string);
      }
    }

    const remote: TransportTripState[] = (tripRows ?? [])
      .map((row) => ({
        id: row.id as string,
        loadId: row.load_id as string,
        sourceWorkSessionId: row.source_work_session_id as string,
        vehicleId: vehicleByTrip.get(row.id as string) ?? "",
        driverId: driverByTrip.get(row.id as string) ?? "",
        originLabel: row.origin_label as string,
        destinationLabel: row.destination_label as string,
        plannedDepartureAt: row.planned_departure_at as string,
        status: row.status as TransportTripStatus,
        revision: Number(row.revision),
        syncState: "confirmed" as const
      }))
      .filter((item) => item.vehicleId && item.driverId);

    const remoteIds = new Set(remote.map((item) => item.id));
    const merged = [
      ...local.filter((item) => !remoteIds.has(item.id)),
      ...remote
    ].sort(
      (a, b) =>
        new Date(b.plannedDepartureAt).getTime() -
        new Date(a.plannedDepartureAt).getTime()
    );

    await putEntityCache(key, "transport-trips", workSessionId, merged);
    return merged;
  } catch {
    await putEntityCache(key, "transport-trips", workSessionId, local);
    return local;
  }
}
