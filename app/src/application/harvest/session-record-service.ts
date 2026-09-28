import type { OfflineCommand } from "../../domain/sync/types";
import {
  createHarvestDowntimeEvent,
  createHarvestMeasurement,
  type DowntimeCause,
  type HarvestDowntimeEvent,
  type HarvestMeasurement,
  type HarvestMeasurementKind,
  type MeasurementProvenance
} from "../../domain/harvest/session-record";
import { getEntityCache, putEntityCache } from "../../infra/local/cache";
import { enqueueCommand, getCommandStatus } from "../../infra/local/outbox";
import { supabase } from "../../infra/supabase/client";

export type SessionFieldRecord =
  | ({
      recordType: "measurement";
      syncState: "confirmed" | "pending" | "error";
      commandId?: string;
    } & HarvestMeasurement)
  | ({
      recordType: "downtime";
      syncState: "confirmed" | "pending" | "error";
      commandId?: string;
    } & HarvestDowntimeEvent);

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

function cacheKey(organizationId: string, workSessionId: string) {
  return `harvest-session-records:v1:${organizationId}:${workSessionId}`;
}

async function addPendingRecord(
  organizationId: string,
  workSessionId: string,
  record: SessionFieldRecord
) {
  const key = cacheKey(organizationId, workSessionId);
  const current = (await getEntityCache<SessionFieldRecord[]>(key)) ?? [];
  const next = [record, ...current.filter((item) => item.id !== record.id)];
  await putEntityCache(key, "harvest-session-records", workSessionId, next);
}

export async function queueHarvestMeasurement(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  workSessionId: string;
  equipmentId?: string;
  kind: HarvestMeasurementKind;
  value: number;
  provenance?: MeasurementProvenance;
  observedAt: string;
  note?: string;
}): Promise<OfflineCommand<HarvestMeasurement>> {
  const payload = createHarvestMeasurement(input);
  const command: OfflineCommand<HarvestMeasurement> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "harvest.record_measurement",
    targetRef: payload.id,
    payload,
    dependencies: []
  };

  await enqueueCommand(command);
  await addPendingRecord(input.organizationId, input.workSessionId, {
    ...payload,
    recordType: "measurement",
    syncState: "pending",
    commandId: command.clientOperationId
  });

  return command;
}

export async function queueHarvestDowntime(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  workSessionId: string;
  blockingEquipmentId?: string;
  cause: DowntimeCause;
  startedAt: string;
  endedAt: string;
  provenance?: MeasurementProvenance;
  note?: string;
}): Promise<OfflineCommand<HarvestDowntimeEvent>> {
  const payload = createHarvestDowntimeEvent(input);
  const command: OfflineCommand<HarvestDowntimeEvent> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "harvest.record_downtime",
    targetRef: payload.id,
    payload,
    dependencies: []
  };

  await enqueueCommand(command);
  await addPendingRecord(input.organizationId, input.workSessionId, {
    ...payload,
    recordType: "downtime",
    syncState: "pending",
    commandId: command.clientOperationId
  });

  return command;
}

async function reconcileLocal(records: SessionFieldRecord[]) {
  return Promise.all(
    records.map(async (record) => {
      if (record.syncState !== "pending" || !record.commandId) return record;
      const status = await getCommandStatus(record.commandId);
      if (!status || status === "pending" || status === "syncing" || status === "pending_external") {
        return record;
      }
      if (status === "accepted" || status === "duplicate") {
        return { ...record, syncState: "confirmed" as const };
      }
      return { ...record, syncState: "error" as const };
    })
  );
}

export async function listSessionFieldRecords(
  organizationId: string,
  workSessionId: string
): Promise<SessionFieldRecord[]> {
  if (!supabase) throw new Error("Supabase is not configured");

  const key = cacheKey(organizationId, workSessionId);
  const local = await reconcileLocal(
    (await getEntityCache<SessionFieldRecord[]>(key)) ?? []
  );

  try {
    const [{ data: measurements, error: measurementError }, { data: downtime, error: downtimeError }] =
      await Promise.all([
        supabase
          .from("harvest_session_measurements")
          .select(
            "id, work_session_id, equipment_id, metric_kind, numeric_value, unit, provenance, observed_at, note"
          )
          .eq("organization_id", organizationId)
          .eq("work_session_id", workSessionId)
          .order("observed_at", { ascending: false }),
        supabase
          .from("harvest_downtime_events")
          .select(
            "id, work_session_id, blocking_equipment_id, cause, started_at, ended_at, provenance, note"
          )
          .eq("organization_id", organizationId)
          .eq("work_session_id", workSessionId)
          .order("started_at", { ascending: false })
      ]);

    if (measurementError) throw measurementError;
    if (downtimeError) throw downtimeError;

    const remote: SessionFieldRecord[] = [
      ...(measurements ?? []).map((row) => ({
        recordType: "measurement" as const,
        syncState: "confirmed" as const,
        id: row.id as string,
        workSessionId: row.work_session_id as string,
        equipmentId: (row.equipment_id as string | null) ?? undefined,
        kind: row.metric_kind as HarvestMeasurementKind,
        value: Number(row.numeric_value),
        unit: row.unit as HarvestMeasurement["unit"],
        provenance: row.provenance as MeasurementProvenance,
        observedAt: row.observed_at as string,
        note: (row.note as string | null) ?? undefined
      })),
      ...(downtime ?? []).map((row) => ({
        recordType: "downtime" as const,
        syncState: "confirmed" as const,
        id: row.id as string,
        workSessionId: row.work_session_id as string,
        blockingEquipmentId:
          (row.blocking_equipment_id as string | null) ?? undefined,
        cause: row.cause as DowntimeCause,
        startedAt: row.started_at as string,
        endedAt: row.ended_at as string,
        provenance: row.provenance as MeasurementProvenance,
        note: (row.note as string | null) ?? undefined
      }))
    ];

    const remoteIds = new Set(remote.map((item) => item.id));
    const merged = [
      ...local.filter((item) => !remoteIds.has(item.id)),
      ...remote
    ].sort((a, b) => {
      const left =
        a.recordType === "measurement" ? a.observedAt : a.startedAt;
      const right =
        b.recordType === "measurement" ? b.observedAt : b.startedAt;
      return new Date(right).getTime() - new Date(left).getTime();
    });

    await putEntityCache(
      key,
      "harvest-session-records",
      workSessionId,
      merged
    );
    return merged;
  } catch (error) {
    if (local.length > 0) {
      await putEntityCache(
        key,
        "harvest-session-records",
        workSessionId,
        local
      );
      return local;
    }
    throw error;
  }
}
