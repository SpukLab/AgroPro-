export type TransportVehicleKind = "truck";
export type TransportLoadStatus = "loaded";
export type TransportQuantityUnit = "kg" | "t";
export type TransportLoadProvenance =
  | "manual"
  | "estimated"
  | "machine"
  | "scale";

export interface TransportVehicle {
  id: string;
  vehicleKind: TransportVehicleKind;
  displayName: string;
  plate?: string;
  status: "active";
}

export interface TransportLoad {
  id: string;
  grainBatchId: string;
  sourceWorkSessionId: string;
  sourceEquipmentId: string;
  vehicleId: string;
  quantityValue: number;
  quantityUnit: TransportQuantityUnit;
  quantityKg: number;
  provenance: TransportLoadProvenance;
  loadedAt: string;
  status: TransportLoadStatus;
  note?: string;
}

function validTimestamp(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

export function createTransportVehicle(input: {
  id?: string;
  displayName: string;
  plate?: string;
}): TransportVehicle {
  const displayName = input.displayName.trim();
  const plate = input.plate?.trim().toUpperCase();

  if (!displayName) {
    throw new Error("displayName is required");
  }

  if (displayName.length > 120) {
    throw new Error("displayName is too long");
  }

  if (plate && plate.length > 20) {
    throw new Error("plate is too long");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    vehicleKind: "truck",
    displayName,
    plate: plate || undefined,
    status: "active"
  };
}

export function createTransportLoad(input: {
  id?: string;
  grainBatchId: string;
  sourceWorkSessionId: string;
  sourceEquipmentId: string;
  vehicleId: string;
  quantityValue: number;
  quantityUnit: TransportQuantityUnit;
  provenance?: TransportLoadProvenance;
  loadedAt: string;
  note?: string;
}): TransportLoad {
  if (!input.grainBatchId.trim()) {
    throw new Error("grainBatchId is required");
  }

  if (!input.sourceWorkSessionId.trim()) {
    throw new Error("sourceWorkSessionId is required");
  }

  if (!input.sourceEquipmentId.trim()) {
    throw new Error("sourceEquipmentId is required");
  }

  if (!input.vehicleId.trim()) {
    throw new Error("vehicleId is required");
  }

  if (!Number.isFinite(input.quantityValue) || input.quantityValue <= 0) {
    throw new Error("quantityValue must be greater than 0");
  }

  if (!validTimestamp(input.loadedAt)) {
    throw new Error("loadedAt must be a valid timestamp");
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
    vehicleId: input.vehicleId,
    quantityValue: input.quantityValue,
    quantityUnit: input.quantityUnit,
    quantityKg,
    provenance: input.provenance ?? "estimated",
    loadedAt: input.loadedAt,
    status: "loaded",
    note: input.note?.trim() || undefined
  };
}
