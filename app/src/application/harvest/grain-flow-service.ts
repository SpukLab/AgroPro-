import type { OfflineCommand } from "../../domain/sync/types";
import {
  createGrainTransfer,
  createSessionPrimaryGrainBatch,
  type GrainBatch,
  type GrainQuantityUnit,
  type GrainTransfer,
  type GrainTransferProvenance
} from "../../domain/harvest/grain-flow";
import { getEntityCache, putEntityCache } from "../../infra/local/cache";
import { enqueueCommand, getCommandStatus } from "../../infra/local/outbox";
import { supabase } from "../../infra/supabase/client";

export interface GrainBatchState extends GrainBatch {
  syncState: "confirmed" | "pending" | "error";
  commandId?: string;
}

export interface GrainTransferState extends GrainTransfer {
  syncState: "confirmed" | "pending" | "error";
  commandId?: string;
}

export interface GrainFlowSnapshot {
  batch?: GrainBatchState;
  transfers: GrainTransferState[];
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

function cacheKey(organizationId: string, workSessionId: string) {
  return `grain-flow:v1:${organizationId}:${workSessionId}`;
}

async function readLocal(
  organizationId: string,
  workSessionId: string
): Promise<GrainFlowSnapshot> {
  return (
    (await getEntityCache<GrainFlowSnapshot>(
      cacheKey(organizationId, workSessionId)
    )) ?? { transfers: [] }
  );
}

async function writeLocal(
  organizationId: string,
  workSessionId: string,
  snapshot: GrainFlowSnapshot
) {
  await putEntityCache(
    cacheKey(organizationId, workSessionId),
    "grain-flow",
    workSessionId,
    snapshot
  );
}

async function reconcileState(
  state: "confirmed" | "pending" | "error",
  commandId?: string
): Promise<"confirmed" | "pending" | "error"> {
  if (state !== "pending" || !commandId) return state;

  const status = await getCommandStatus(commandId);

  if (
    !status ||
    status === "pending" ||
    status === "syncing" ||
    status === "pending_external"
  ) {
    return "pending";
  }

  if (status === "accepted" || status === "duplicate") {
    return "confirmed";
  }

  return "error";
}

async function reconcileLocal(snapshot: GrainFlowSnapshot) {
  return {
    batch: snapshot.batch
      ? {
          ...snapshot.batch,
          syncState: await reconcileState(
            snapshot.batch.syncState,
            snapshot.batch.commandId
          )
        }
      : undefined,
    transfers: await Promise.all(
      snapshot.transfers.map(async (transfer) => ({
        ...transfer,
        syncState: await reconcileState(
          transfer.syncState,
          transfer.commandId
        )
      }))
    )
  } satisfies GrainFlowSnapshot;
}

export async function ensureSessionPrimaryGrainBatch(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  workSessionId: string;
  agriculturalOperationId: string;
}): Promise<{
  batch: GrainBatchState;
  dependencyCommandId?: string;
}> {
  const local = await reconcileLocal(
    await readLocal(input.organizationId, input.workSessionId)
  );

  if (local.batch && local.batch.syncState !== "error") {
    await writeLocal(input.organizationId, input.workSessionId, local);
    return {
      batch: local.batch,
      dependencyCommandId:
        local.batch.syncState === "pending"
          ? local.batch.commandId
          : undefined
    };
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("grain_batches")
        .select(
          "id, agricultural_operation_id, source_work_session_id, batch_key, status"
        )
        .eq("organization_id", input.organizationId)
        .eq("id", input.workSessionId)
        .limit(1);

      if (error) throw error;

      const row = data?.[0];
      if (row) {
        const confirmed: GrainBatchState = {
          id: row.id as string,
          agriculturalOperationId: row.agricultural_operation_id as string,
          sourceWorkSessionId: row.source_work_session_id as string,
          batchKey: row.batch_key as "session_primary",
          status: row.status as "open",
          syncState: "confirmed"
        };

        await writeLocal(input.organizationId, input.workSessionId, {
          batch: confirmed,
          transfers: local.transfers
        });

        return { batch: confirmed };
      }
    } catch {
      // Offline/network failures fall through to local creation.
    }
  }

  const batch = createSessionPrimaryGrainBatch({
    workSessionId: input.workSessionId,
    agriculturalOperationId: input.agriculturalOperationId
  });

  const command: OfflineCommand<GrainBatch> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "harvest.create_grain_batch",
    targetRef: batch.id,
    payload: batch,
    dependencies: []
  };

  await enqueueCommand(command);

  const pending: GrainBatchState = {
    ...batch,
    syncState: "pending",
    commandId: command.clientOperationId
  };

  await writeLocal(input.organizationId, input.workSessionId, {
    batch: pending,
    transfers: local.transfers
  });

  return {
    batch: pending,
    dependencyCommandId: command.clientOperationId
  };
}

export async function queueGrainTransfer(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  workSessionId: string;
  agriculturalOperationId: string;
  sourceEquipmentId: string;
  destinationEquipmentId: string;
  quantityValue: number;
  quantityUnit: GrainQuantityUnit;
  provenance?: GrainTransferProvenance;
  occurredAt: string;
  note?: string;
}): Promise<OfflineCommand<GrainTransfer>> {
  const ensured = await ensureSessionPrimaryGrainBatch(input);

  const transfer = createGrainTransfer({
    grainBatchId: ensured.batch.id,
    workSessionId: input.workSessionId,
    sourceEquipmentId: input.sourceEquipmentId,
    destinationEquipmentId: input.destinationEquipmentId,
    quantityValue: input.quantityValue,
    quantityUnit: input.quantityUnit,
    provenance: input.provenance,
    occurredAt: input.occurredAt,
    note: input.note
  });

  const command: OfflineCommand<GrainTransfer> = {
    ...common(input),
    clientOperationId: crypto.randomUUID(),
    commandType: "harvest.record_grain_transfer",
    targetRef: transfer.id,
    payload: transfer,
    dependencies: ensured.dependencyCommandId
      ? [ensured.dependencyCommandId]
      : []
  };

  await enqueueCommand(command);

  const local = await readLocal(input.organizationId, input.workSessionId);
  const next: GrainFlowSnapshot = {
    batch: ensured.batch,
    transfers: [
      {
        ...transfer,
        syncState: "pending",
        commandId: command.clientOperationId
      },
      ...local.transfers.filter((item) => item.id !== transfer.id)
    ]
  };

  await writeLocal(input.organizationId, input.workSessionId, next);
  return command;
}

export async function listGrainFlow(
  organizationId: string,
  workSessionId: string
): Promise<GrainFlowSnapshot> {
  const local = await reconcileLocal(
    await readLocal(organizationId, workSessionId)
  );

  if (!supabase) {
    await writeLocal(organizationId, workSessionId, local);
    return local;
  }

  try {
    const [{ data: batches, error: batchError }, { data: transfers, error: transferError }] =
      await Promise.all([
        supabase
          .from("grain_batches")
          .select(
            "id, agricultural_operation_id, source_work_session_id, batch_key, status"
          )
          .eq("organization_id", organizationId)
          .eq("source_work_session_id", workSessionId)
          .limit(1),
        supabase
          .from("grain_transfers")
          .select(
            "id, grain_batch_id, work_session_id, source_equipment_id, destination_equipment_id, quantity_value, quantity_unit, quantity_kg, provenance, occurred_at, note"
          )
          .eq("organization_id", organizationId)
          .eq("work_session_id", workSessionId)
          .order("occurred_at", { ascending: false })
      ]);

    if (batchError) throw batchError;
    if (transferError) throw transferError;

    const row = batches?.[0];
    const remoteBatch: GrainBatchState | undefined = row
      ? {
          id: row.id as string,
          agriculturalOperationId: row.agricultural_operation_id as string,
          sourceWorkSessionId: row.source_work_session_id as string,
          batchKey: row.batch_key as "session_primary",
          status: row.status as "open",
          syncState: "confirmed"
        }
      : undefined;

    const remoteTransfers: GrainTransferState[] = (transfers ?? []).map(
      (transfer) => ({
        id: transfer.id as string,
        grainBatchId: transfer.grain_batch_id as string,
        workSessionId: transfer.work_session_id as string,
        sourceEquipmentId: transfer.source_equipment_id as string,
        destinationEquipmentId: transfer.destination_equipment_id as string,
        quantityValue: Number(transfer.quantity_value),
        quantityUnit: transfer.quantity_unit as GrainQuantityUnit,
        quantityKg: Number(transfer.quantity_kg),
        provenance: transfer.provenance as GrainTransferProvenance,
        occurredAt: transfer.occurred_at as string,
        note: (transfer.note as string | null) ?? undefined,
        syncState: "confirmed"
      })
    );

    const remoteIds = new Set(remoteTransfers.map((item) => item.id));
    const merged: GrainFlowSnapshot = {
      batch: remoteBatch ?? local.batch,
      transfers: [
        ...local.transfers.filter((item) => !remoteIds.has(item.id)),
        ...remoteTransfers
      ].sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() -
          new Date(a.occurredAt).getTime()
      )
    };

    await writeLocal(organizationId, workSessionId, merged);
    return merged;
  } catch {
    await writeLocal(organizationId, workSessionId, local);
    return local;
  }
}
