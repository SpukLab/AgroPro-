export type GrainQuantityUnit = "kg" | "t";

export type GrainTransferProvenance =
  | "manual"
  | "estimated"
  | "machine"
  | "scale";

export interface GrainBatch {
  id: string;
  agriculturalOperationId: string;
  sourceWorkSessionId: string;
  batchKey: "session_primary";
  status: "open";
}

export interface GrainTransfer {
  id: string;
  grainBatchId: string;
  workSessionId: string;
  sourceEquipmentId: string;
  destinationEquipmentId: string;
  quantityValue: number;
  quantityUnit: GrainQuantityUnit;
  quantityKg: number;
  provenance: GrainTransferProvenance;
  occurredAt: string;
  note?: string;
}

function validTimestamp(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

export function createSessionPrimaryGrainBatch(input: {
  workSessionId: string;
  agriculturalOperationId: string;
}): GrainBatch {
  if (!input.workSessionId.trim()) {
    throw new Error("workSessionId is required");
  }

  if (!input.agriculturalOperationId.trim()) {
    throw new Error("agriculturalOperationId is required");
  }

  return {
    // One deterministic primary batch per WorkSession in this slice.
    // Later segregated batches can use independent ids/keys without changing transfer semantics.
    id: input.workSessionId,
    agriculturalOperationId: input.agriculturalOperationId,
    sourceWorkSessionId: input.workSessionId,
    batchKey: "session_primary",
    status: "open"
  };
}

export function createGrainTransfer(input: {
  id?: string;
  grainBatchId: string;
  workSessionId: string;
  sourceEquipmentId: string;
  destinationEquipmentId: string;
  quantityValue: number;
  quantityUnit: GrainQuantityUnit;
  provenance?: GrainTransferProvenance;
  occurredAt: string;
  note?: string;
}): GrainTransfer {
  if (!input.grainBatchId.trim()) {
    throw new Error("grainBatchId is required");
  }

  if (!input.workSessionId.trim()) {
    throw new Error("workSessionId is required");
  }

  if (!input.sourceEquipmentId.trim()) {
    throw new Error("sourceEquipmentId is required");
  }

  if (!input.destinationEquipmentId.trim()) {
    throw new Error("destinationEquipmentId is required");
  }

  if (input.sourceEquipmentId === input.destinationEquipmentId) {
    throw new Error("source and destination equipment must differ");
  }

  if (!Number.isFinite(input.quantityValue) || input.quantityValue <= 0) {
    throw new Error("quantityValue must be greater than 0");
  }

  if (!validTimestamp(input.occurredAt)) {
    throw new Error("occurredAt must be a valid timestamp");
  }

  const quantityKg =
    input.quantityUnit === "t"
      ? input.quantityValue * 1000
      : input.quantityValue;

  return {
    id: input.id ?? crypto.randomUUID(),
    grainBatchId: input.grainBatchId,
    workSessionId: input.workSessionId,
    sourceEquipmentId: input.sourceEquipmentId,
    destinationEquipmentId: input.destinationEquipmentId,
    quantityValue: input.quantityValue,
    quantityUnit: input.quantityUnit,
    quantityKg,
    provenance: input.provenance ?? "estimated",
    occurredAt: input.occurredAt,
    note: input.note?.trim() || undefined
  };
}
