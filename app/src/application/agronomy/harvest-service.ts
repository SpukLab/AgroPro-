import { createHarvestOperation } from "../../domain/operations/agricultural-operation";
import type { OfflineCommand } from "../../domain/sync/types";
import { enqueueCommand } from "../../infra/local/outbox";
import { supabase } from "../../infra/supabase/client";

export interface QueueHarvestInput {
  actorId: string;
  organizationId: string;
  deviceId: string;
  fieldId: string;
  campaignId: string;
  cropCode: string;
  plannedAreaHa: number;
  plannedFrom: string;
  plannedTo: string;
}

export interface HarvestOperationReadModel {
  id: string;
  fieldName: string;
  campaignName: string;
  cropCode: string;
  plannedAreaHa: number;
  status: string;
  revision: number;
}

export async function queueHarvestOperation(
  input: QueueHarvestInput
): Promise<OfflineCommand> {
  const operation = createHarvestOperation({
    fieldId: input.fieldId,
    campaignId: input.campaignId,
    cropCode: input.cropCode.trim().toUpperCase(),
    plannedAreaHa: input.plannedAreaHa,
    plannedFrom: input.plannedFrom,
    plannedTo: input.plannedTo
  });

  const now = new Date().toISOString();
  const command: OfflineCommand = {
    clientOperationId: crypto.randomUUID(),
    actorId: input.actorId,
    deviceId: input.deviceId,
    tenantScope: input.organizationId,
    commandType: "agronomy.create_harvest_operation",
    targetRef: operation.id,
    occurredAtLocal: now,
    queuedAtLocal: now,
    payload: operation,
    conflictClass: "C",
    dependencies: [],
    evidenceRefs: [],
    schemaVersion: 1
  };

  await enqueueCommand(command);
  return command;
}

export async function listHarvestOperations(
  organizationId: string
): Promise<HarvestOperationReadModel[]> {
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .from("agricultural_operations")
    .select(
      "id, crop_code, planned_area_ha, status, revision, fields!inner(name), campaigns!inner(name)"
    )
    .eq("organization_id", organizationId)
    .eq("operation_type", "harvest")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    fieldName: (row.fields as unknown as { name: string }).name,
    campaignName: (row.campaigns as unknown as { name: string }).name,
    cropCode: row.crop_code as string,
    plannedAreaHa: Number(row.planned_area_ha),
    status: row.status as string,
    revision: Number(row.revision)
  }));
}
