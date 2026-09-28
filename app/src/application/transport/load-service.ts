import type { OfflineCommand } from "../../domain/sync/types";
import {
  createTransportLoad,
  createTransportVehicle,
  type TransportLoad,
  type TransportLoadProvenance,
  type TransportQuantityUnit,
  type TransportVehicle
} from "../../domain/transport/load";
import { ensureSessionPrimaryGrainBatch } from "../harvest/grain-flow-service";
import { getEntityCache, putEntityCache } from "../../infra/local/cache";
import { enqueueCommand, getCommandStatus } from "../../infra/local/outbox";
import { supabase } from "../../infra/supabase/client";

export interface TransportVehicleState extends TransportVehicle {
  syncState: "confirmed" | "pending" | "error";
  commandId?: string;
}

export interface TransportLoadState extends TransportLoad {
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
    conflictClass: "A" as const,
    evidenceRefs: [] as string[],
    schemaVersion: 1 as const
  };
}

function vehicleCacheKey(organizationId: string) {
  return `transport-vehicles:v1:${organizationId}`;
}

function loadCacheKey(organizationId: string, workSessionId: string) {
  return `transport-loads:v1:${organizationId}:${workSessionId}`;
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

async function reconcileVehicles(vehicles: TransportVehicleState[]) {
  return Promise.all(
    vehicles.map(async (vehicle) => ({
      ...vehicle,
      syncState: await reconcileSyncState(
        vehicle.syncState,
        vehicle.commandId
      )
    }))
  );
}

async function reconcileLoads(loads: TransportLoadState[]) {
  return Promise.all(
    loads.map(async (load) => ({
      ...load,
      syncState: await reconcileSyncState(load.syncState, load.commandId)
    }))
  );
}

export async function queueTransportVehicle(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  displayName: string;
  plate?: string;
}): Promise<OfflineCommand<TransportVehicle>> {
  const vehicle = createTransportVehicle(input);
  const command: OfflineCommand<TransportVehicle> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "transport.create_vehicle",
    targetRef: vehicle.id,
    payload: vehicle,
    dependencies: []
  };

  await enqueueCommand(command);

  const key = vehicleCacheKey(input.organizationId);
  const local =
    (await getEntityCache<TransportVehicleState[]>(key)) ?? [];

  await putEntityCache(key, "transport-vehicles", input.organizationId, [
    {
      ...vehicle,
      syncState: "pending",
      commandId: command.clientOperationId
    },
    ...local.filter((item) => item.id !== vehicle.id)
  ]);

  return command;
}

export async function listTransportVehicles(
  organizationId: string
): Promise<TransportVehicleState[]> {
  const key = vehicleCacheKey(organizationId);
  const local = await reconcileVehicles(
    (await getEntityCache<TransportVehicleState[]>(key)) ?? []
  );

  if (!supabase) {
    await putEntityCache(key, "transport-vehicles", organizationId, local);
    return local;
  }

  try {
    const { data, error } = await supabase
      .from("transport_vehicles")
      .select("id, vehicle_kind, display_name, plate, status")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("display_name", { ascending: true });

    if (error) throw error;

    const remote: TransportVehicleState[] = (data ?? []).map((row) => ({
      id: row.id as string,
      vehicleKind: row.vehicle_kind as "truck",
      displayName: row.display_name as string,
      plate: (row.plate as string | null) ?? undefined,
      status: row.status as "active",
      syncState: "confirmed"
    }));

    const remoteIds = new Set(remote.map((item) => item.id));
    const merged = [
      ...local.filter(
        (item) => !remoteIds.has(item.id) && item.syncState !== "confirmed"
      ),
      ...remote
    ];

    await putEntityCache(
      key,
      "transport-vehicles",
      organizationId,
      merged
    );
    return merged;
  } catch {
    await putEntityCache(key, "transport-vehicles", organizationId, local);
    return local;
  }
}

async function findVehicleState(
  organizationId: string,
  vehicleId: string
) {
  const vehicles = await listTransportVehicles(organizationId);
  return vehicles.find((item) => item.id === vehicleId);
}

export async function queueTransportLoad(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  workSessionId: string;
  agriculturalOperationId: string;
  sourceEquipmentId: string;
  vehicleId: string;
  quantityValue: number;
  quantityUnit: TransportQuantityUnit;
  provenance?: TransportLoadProvenance;
  loadedAt: string;
  note?: string;
}): Promise<OfflineCommand<TransportLoad>> {
  const [batch, vehicle] = await Promise.all([
    ensureSessionPrimaryGrainBatch({
      actorId: input.actorId,
      organizationId: input.organizationId,
      deviceId: input.deviceId,
      workSessionId: input.workSessionId,
      agriculturalOperationId: input.agriculturalOperationId
    }),
    findVehicleState(input.organizationId, input.vehicleId)
  ]);

  if (!vehicle || vehicle.syncState === "error") {
    throw new Error("vehicle is not available");
  }

  const load = createTransportLoad({
    grainBatchId: batch.batch.id,
    sourceWorkSessionId: input.workSessionId,
    sourceEquipmentId: input.sourceEquipmentId,
    vehicleId: input.vehicleId,
    quantityValue: input.quantityValue,
    quantityUnit: input.quantityUnit,
    provenance: input.provenance,
    loadedAt: input.loadedAt,
    note: input.note
  });

  const dependencies = [
    batch.dependencyCommandId,
    vehicle.syncState === "pending" ? vehicle.commandId : undefined
  ].filter((value): value is string => Boolean(value));

  const command: OfflineCommand<TransportLoad> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "transport.create_load",
    targetRef: load.id,
    payload: load,
    dependencies
  };

  await enqueueCommand(command);

  const key = loadCacheKey(input.organizationId, input.workSessionId);
  const local =
    (await getEntityCache<TransportLoadState[]>(key)) ?? [];

  await putEntityCache(key, "transport-loads", input.workSessionId, [
    {
      ...load,
      syncState: "pending",
      commandId: command.clientOperationId
    },
    ...local.filter((item) => item.id !== load.id)
  ]);

  return command;
}

export async function listTransportLoads(
  organizationId: string,
  workSessionId: string
): Promise<TransportLoadState[]> {
  const key = loadCacheKey(organizationId, workSessionId);
  const local = await reconcileLoads(
    (await getEntityCache<TransportLoadState[]>(key)) ?? []
  );

  if (!supabase) {
    await putEntityCache(key, "transport-loads", workSessionId, local);
    return local;
  }

  try {
    const { data, error } = await supabase
      .from("transport_loads")
      .select(
        "id, grain_batch_id, source_work_session_id, source_equipment_id, vehicle_id, quantity_value, quantity_unit, quantity_kg, provenance, loaded_at, status, note"
      )
      .eq("organization_id", organizationId)
      .eq("source_work_session_id", workSessionId)
      .order("loaded_at", { ascending: false });

    if (error) throw error;

    const remote: TransportLoadState[] = (data ?? []).map((row) => ({
      id: row.id as string,
      grainBatchId: row.grain_batch_id as string,
      sourceWorkSessionId: row.source_work_session_id as string,
      sourceEquipmentId: row.source_equipment_id as string,
      vehicleId: row.vehicle_id as string,
      quantityValue: Number(row.quantity_value),
      quantityUnit: row.quantity_unit as TransportQuantityUnit,
      quantityKg: Number(row.quantity_kg),
      provenance: row.provenance as TransportLoadProvenance,
      loadedAt: row.loaded_at as string,
      status: row.status as "loaded",
      note: (row.note as string | null) ?? undefined,
      syncState: "confirmed"
    }));

    const remoteIds = new Set(remote.map((item) => item.id));
    const merged = [
      ...local.filter((item) => !remoteIds.has(item.id)),
      ...remote
    ].sort(
      (a, b) =>
        new Date(b.loadedAt).getTime() -
        new Date(a.loadedAt).getTime()
    );

    await putEntityCache(key, "transport-loads", workSessionId, merged);
    return merged;
  } catch {
    await putEntityCache(key, "transport-loads", workSessionId, local);
    return local;
  }
}
