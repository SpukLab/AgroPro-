export type GrainStorageKind = "silo" | "silobag";
export type GrainStorageReceiptStatus = "stored";
export type GrainStorageQuantityUnit = "kg" | "t";
export type GrainStorageProvenance =
  | "manual"
  | "estimated"
  | "machine"
  | "scale";

export interface GrainStorageUnit {
  id: string;
  storageKind: GrainStorageKind;
  displayName: string;
  status: "active";
}

export interface GrainStorageReceipt {
  id: string;
  grainBatchId: string;
  sourceWorkSessionId: string;
  sourceEquipmentId: string;
  storageUnitId: string;
  quantityValue: number;
  quantityUnit: GrainStorageQuantityUnit;
  quantityKg: number;
  provenance: GrainStorageProvenance;
  receivedAt: string;
  status: GrainStorageReceiptStatus;
  note?: string;
}

function validTimestamp(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

export function createGrainStorageUnit(input: {
  id?: string;
  storageKind: GrainStorageKind;
  displayName: string;
}): GrainStorageUnit {
  const displayName = input.displayName.trim();

  if (!displayName) {
    throw new Error("displayName is required");
  }

  if (displayName.length > 120) {
    throw new Error("displayName is too long");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    storageKind: input.storageKind,
    displayName,
    status: "active"
  };
}

export function createGrainStorageReceipt(input: {
  id?: string;
  grainBatchId: string;
  sourceWorkSessionId: string;
  sourceEquipmentId: string;
  storageUnitId: string;
  quantityValue: number;
  quantityUnit: GrainStorageQuantityUnit;
  provenance?: GrainStorageProvenance;
  receivedAt: string;
  note?: string;
}): GrainStorageReceipt {
  if (!input.grainBatchId.trim()) {
    throw new Error("grainBatchId is required");
  }

  if (!input.sourceWorkSessionId.trim()) {
    throw new Error("sourceWorkSessionId is required");
  }

  if (!input.sourceEquipmentId.trim()) {
    throw new Error("sourceEquipmentId is required");
  }

  if (!input.storageUnitId.trim()) {
    throw new Error("storageUnitId is required");
  }

  if (!Number.isFinite(input.quantityValue) || input.quantityValue <= 0) {
    throw new Error("quantityValue must be greater than 0");
  }

  if (!validTimestamp(input.receivedAt)) {
    throw new Error("receivedAt must be a valid timestamp");
  }

  const quantityKg =
    input.quantityUnit === "t"
      ? input.quantityValue * 1000
      : input.quantityValue;

  return {
    id: input.id ?? crypto.randomUUID(),
    grainBatchId: input.grainBatchId,
    sourceWorkSessionId: input.sourceWorkSessionId,
    sourceEquipmentId: input.sourceEquipmentId,
    storageUnitId: input.storageUnitId,
    quantityValue: input.quantityValue,
    quantityUnit: input.quantityUnit,
    quantityKg,
    provenance: input.provenance ?? "estimated",
    receivedAt: input.receivedAt,
    status: "stored",
    note: input.note?.trim() || undefined
  };
}
