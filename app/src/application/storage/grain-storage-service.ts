import type { OfflineCommand } from "../../domain/sync/types";
import {
  createGrainStorageReceipt,
  createGrainStorageUnit,
  type GrainStorageKind,
  type GrainStorageProvenance,
  type GrainStorageQuantityUnit,
  type GrainStorageReceipt,
  type GrainStorageUnit
} from "../../domain/storage/grain-storage";
import { ensureSessionPrimaryGrainBatch } from "../harvest/grain-flow-service";
import { getEntityCache, putEntityCache } from "../../infra/local/cache";
import { enqueueCommand, getCommandStatus } from "../../infra/local/outbox";
import { supabase } from "../../infra/supabase/client";

export interface GrainStorageUnitState extends GrainStorageUnit {
  syncState: "confirmed" | "pending" | "error";
  commandId?: string;
}

export interface GrainStorageReceiptState extends GrainStorageReceipt {
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

function unitCacheKey(organizationId: string) {
  return `grain-storage-units:v1:${organizationId}`;
}

function receiptCacheKey(organizationId: string, workSessionId: string) {
  return `grain-storage-receipts:v1:${organizationId}:${workSessionId}`;
}

async function reconcileState(
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

async function reconcileUnits(units: GrainStorageUnitState[]) {
  return Promise.all(
    units.map(async (unit) => ({
      ...unit,
      syncState: await reconcileState(unit.syncState, unit.commandId)
    }))
  );
}

async function reconcileReceipts(receipts: GrainStorageReceiptState[]) {
  return Promise.all(
    receipts.map(async (receipt) => ({
      ...receipt,
      syncState: await reconcileState(
        receipt.syncState,
        receipt.commandId
      )
    }))
  );
}

export async function queueGrainStorageUnit(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  storageKind: GrainStorageKind;
  displayName: string;
}): Promise<OfflineCommand<GrainStorageUnit>> {
  const unit = createGrainStorageUnit(input);
  const command: OfflineCommand<GrainStorageUnit> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "storage.create_unit",
    targetRef: unit.id,
    payload: unit,
    dependencies: []
  };

  await enqueueCommand(command);

  const key = unitCacheKey(input.organizationId);
  const local =
    (await getEntityCache<GrainStorageUnitState[]>(key)) ?? [];

  await putEntityCache(key, "grain-storage-units", input.organizationId, [
    {
      ...unit,
      syncState: "pending",
      commandId: command.clientOperationId
    },
    ...local.filter((item) => item.id !== unit.id)
  ]);

  return command;
}

export async function listGrainStorageUnits(
  organizationId: string
): Promise<GrainStorageUnitState[]> {
  const key = unitCacheKey(organizationId);
  const local = await reconcileUnits(
    (await getEntityCache<GrainStorageUnitState[]>(key)) ?? []
  );

  if (!supabase) {
    await putEntityCache(key, "grain-storage-units", organizationId, local);
    return local;
  }

  try {
    const { data, error } = await supabase
      .from("grain_storage_units")
      .select("id, storage_kind, display_name, status")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("display_name", { ascending: true });

    if (error) throw error;

    const remote: GrainStorageUnitState[] = (data ?? []).map((row) => ({
      id: row.id as string,
      storageKind: row.storage_kind as GrainStorageKind,
      displayName: row.display_name as string,
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
      "grain-storage-units",
      organizationId,
      merged
    );
    return merged;
  } catch {
    await putEntityCache(key, "grain-storage-units", organizationId, local);
    return local;
  }
}

async function findStorageUnitState(
  organizationId: string,
  storageUnitId: string
) {
  const units = await listGrainStorageUnits(organizationId);
  return units.find((item) => item.id === storageUnitId);
}

export async function queueGrainStorageReceipt(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  workSessionId: string;
  agriculturalOperationId: string;
  sourceEquipmentId: string;
  storageUnitId: string;
  quantityValue: number;
  quantityUnit: GrainStorageQuantityUnit;
  provenance?: GrainStorageProvenance;
  receivedAt: string;
  note?: string;
}): Promise<OfflineCommand<GrainStorageReceipt>> {
  const [batch, storageUnit] = await Promise.all([
    ensureSessionPrimaryGrainBatch({
      actorId: input.actorId,
      organizationId: input.organizationId,
      deviceId: input.deviceId,
      workSessionId: input.workSessionId,
      agriculturalOperationId: input.agriculturalOperationId
    }),
    findStorageUnitState(input.organizationId, input.storageUnitId)
  ]);

  if (!storageUnit || storageUnit.syncState === "error") {
    throw new Error("storage unit is not available");
  }

  const receipt = createGrainStorageReceipt({
    grainBatchId: batch.batch.id,
    sourceWorkSessionId: input.workSessionId,
    sourceEquipmentId: input.sourceEquipmentId,
    storageUnitId: input.storageUnitId,
    quantityValue: input.quantityValue,
    quantityUnit: input.quantityUnit,
    provenance: input.provenance,
    receivedAt: input.receivedAt,
    note: input.note
  });

  const dependencies = [
    batch.dependencyCommandId,
    storageUnit.syncState === "pending"
      ? storageUnit.commandId
      : undefined
  ].filter((value): value is string => Boolean(value));

  const command: OfflineCommand<GrainStorageReceipt> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "storage.record_grain_receipt",
    targetRef: receipt.id,
    payload: receipt,
    dependencies
  };

  await enqueueCommand(command);

  const key = receiptCacheKey(input.organizationId, input.workSessionId);
  const local =
    (await getEntityCache<GrainStorageReceiptState[]>(key)) ?? [];

  await putEntityCache(key, "grain-storage-receipts", input.workSessionId, [
    {
      ...receipt,
      syncState: "pending",
      commandId: command.clientOperationId
    },
    ...local.filter((item) => item.id !== receipt.id)
  ]);

  return command;
}

export async function listGrainStorageReceipts(
  organizationId: string,
  workSessionId: string
): Promise<GrainStorageReceiptState[]> {
  const key = receiptCacheKey(organizationId, workSessionId);
  const local = await reconcileReceipts(
    (await getEntityCache<GrainStorageReceiptState[]>(key)) ?? []
  );

  if (!supabase) {
    await putEntityCache(key, "grain-storage-receipts", workSessionId, local);
    return local;
  }

  try {
    const { data, error } = await supabase
      .from("grain_storage_receipts")
      .select(
        "id, grain_batch_id, source_work_session_id, source_equipment_id, storage_unit_id, quantity_value, quantity_unit, quantity_kg, provenance, received_at, status, note"
      )
      .eq("organization_id", organizationId)
      .eq("source_work_session_id", workSessionId)
      .order("received_at", { ascending: false });

    if (error) throw error;

    const remote: GrainStorageReceiptState[] = (data ?? []).map((row) => ({
      id: row.id as string,
      grainBatchId: row.grain_batch_id as string,
      sourceWorkSessionId: row.source_work_session_id as string,
      sourceEquipmentId: row.source_equipment_id as string,
      storageUnitId: row.storage_unit_id as string,
      quantityValue: Number(row.quantity_value),
      quantityUnit: row.quantity_unit as GrainStorageQuantityUnit,
      quantityKg: Number(row.quantity_kg),
      provenance: row.provenance as GrainStorageProvenance,
      receivedAt: row.received_at as string,
      status: row.status as "stored",
      note: (row.note as string | null) ?? undefined,
      syncState: "confirmed"
    }));

    const remoteIds = new Set(remote.map((item) => item.id));
    const merged = [
      ...local.filter((item) => !remoteIds.has(item.id)),
      ...remote
    ].sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() -
        new Date(a.receivedAt).getTime()
    );

    await putEntityCache(
      key,
      "grain-storage-receipts",
      workSessionId,
      merged
    );
    return merged;
  } catch {
    await putEntityCache(key, "grain-storage-receipts", workSessionId, local);
    return local;
  }
}
