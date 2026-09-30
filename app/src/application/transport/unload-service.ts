import type { OfflineCommand } from "../../domain/sync/types";
import {
  createTransportUnloadResult,
  type TransportUnloadProvenance,
  type TransportUnloadResult,
  type TransportUnloadUnit
} from "../../domain/transport/unload";
import {
  listTransportTrips,
  mutateLocalTransportTrip
} from "./trip-service";
import { getEntityCache, putEntityCache } from "../../infra/local/cache";
import { enqueueCommand, getCommandStatus } from "../../infra/local/outbox";
import { supabase } from "../../infra/supabase/client";

export interface TransportUnloadResultState extends TransportUnloadResult {
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

function unloadCacheKey(organizationId: string, workSessionId: string) {
  return `transport-unloads:v1:${organizationId}:${workSessionId}`;
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

export async function queueCompleteTransportUnload(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  workSessionId: string;
  tripId: string;
  quantityValue: number;
  quantityUnit: TransportUnloadUnit;
  provenance?: TransportUnloadProvenance;
  unloadedAt: string;
  moisturePercent?: number;
  ticketRef?: string;
  note?: string;
}): Promise<OfflineCommand<TransportUnloadResult & { expectedRevision: number }>> {
  const trips = await listTransportTrips(
    input.organizationId,
    input.workSessionId
  );
  const trip = trips.find((item) => item.id === input.tripId);

  if (!trip || trip.syncState === "error") {
    throw new Error("trip is not available");
  }

  if (trip.status !== "unloading") {
    throw new Error("trip is not unloading");
  }

  const unload = createTransportUnloadResult({
    tripId: trip.id,
    loadId: trip.loadId,
    destinationLabel: trip.destinationLabel,
    quantityValue: input.quantityValue,
    quantityUnit: input.quantityUnit,
    provenance: input.provenance,
    unloadedAt: input.unloadedAt,
    moisturePercent: input.moisturePercent,
    ticketRef: input.ticketRef,
    note: input.note
  });

  const payload = {
    ...unload,
    expectedRevision: trip.revision
  };

  const command: OfflineCommand<typeof payload> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "transport.complete_unload",
    targetRef: trip.id,
    baseRevision: trip.revision,
    payload,
    dependencies:
      trip.syncState === "pending" && trip.commandId ? [trip.commandId] : []
  };

  await enqueueCommand(command);

  const key = unloadCacheKey(input.organizationId, input.workSessionId);
  const local =
    (await getEntityCache<TransportUnloadResultState[]>(key)) ?? [];

  await putEntityCache(key, "transport-unloads", input.workSessionId, [
    {
      ...unload,
      syncState: "pending",
      commandId: command.clientOperationId
    },
    ...local.filter((item) => item.id !== unload.id)
  ]);

  await mutateLocalTransportTrip(
    input.organizationId,
    input.workSessionId,
    trip.id,
    (current) => ({
      ...current,
      status: "delivered",
      revision: current.revision + 1,
      syncState: "pending",
      commandId: command.clientOperationId
    })
  );

  return command;
}

export async function listTransportUnloadResults(
  organizationId: string,
  workSessionId: string
): Promise<TransportUnloadResultState[]> {
  const key = unloadCacheKey(organizationId, workSessionId);
  const local = await Promise.all(
    ((await getEntityCache<TransportUnloadResultState[]>(key)) ?? []).map(
      async (item) => ({
        ...item,
        syncState: await reconcileSyncState(item.syncState, item.commandId)
      })
    )
  );

  if (!supabase) {
    await putEntityCache(key, "transport-unloads", workSessionId, local);
    return local;
  }

  try {
    const { data, error } = await supabase
      .from("transport_unload_results")
      .select(
        "id, trip_id, load_id, destination_label, quantity_value, quantity_unit, quantity_kg, provenance, unloaded_at, moisture_percent, ticket_ref, note, status"
      )
      .eq("organization_id", organizationId)
      .eq("source_work_session_id", workSessionId)
      .order("unloaded_at", { ascending: false });

    if (error) throw error;

    const remote: TransportUnloadResultState[] = (data ?? []).map((row) => ({
      id: row.id as string,
      tripId: row.trip_id as string,
      loadId: row.load_id as string,
      destinationLabel: row.destination_label as string,
      quantityValue: Number(row.quantity_value),
      quantityUnit: row.quantity_unit as TransportUnloadUnit,
      quantityKg: Number(row.quantity_kg),
      provenance: row.provenance as TransportUnloadProvenance,
      unloadedAt: row.unloaded_at as string,
      moisturePercent:
        row.moisture_percent === null
          ? undefined
          : Number(row.moisture_percent),
      ticketRef: (row.ticket_ref as string | null) ?? undefined,
      note: (row.note as string | null) ?? undefined,
      status: row.status as "delivered",
      syncState: "confirmed"
    }));

    const remoteIds = new Set(remote.map((item) => item.id));
    const merged = [
      ...local.filter((item) => !remoteIds.has(item.id)),
      ...remote
    ].sort(
      (a, b) =>
        new Date(b.unloadedAt).getTime() -
        new Date(a.unloadedAt).getTime()
    );

    await putEntityCache(key, "transport-unloads", workSessionId, merged);
    return merged;
  } catch {
    await putEntityCache(key, "transport-unloads", workSessionId, local);
    return local;
  }
}
