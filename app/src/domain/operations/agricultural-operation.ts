export type AgriculturalOperationStatus =
  | "planned"
  | "ready"
  | "active"
  | "completed"
  | "cancelled";

export interface AgriculturalOperation {
  id: string;
  fieldId: string;
  campaignId: string;
  cropCode: string;
  operationType: "harvest";
  plannedAreaHa: number;
  plannedFrom: string;
  plannedTo: string;
  status: AgriculturalOperationStatus;
  revision: number;
}

export interface CreateHarvestOperationInput {
  id?: string;
  fieldId: string;
  campaignId: string;
  cropCode: string;
  plannedAreaHa: number;
  plannedFrom: string;
  plannedTo: string;
}

export class RevisionConflictError extends Error {
  constructor(expected: number, actual: number) {
    super(`Revision conflict: expected ${expected}, actual ${actual}`);
    this.name = "RevisionConflictError";
  }
}

const transitions: Record<AgriculturalOperationStatus, AgriculturalOperationStatus[]> = {
  planned: ["ready", "cancelled"],
  ready: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: []
};

export function createHarvestOperation(
  input: CreateHarvestOperationInput
): AgriculturalOperation {
  if (!Number.isFinite(input.plannedAreaHa) || input.plannedAreaHa <= 0) {
    throw new Error("plannedAreaHa must be greater than zero");
  }

  if (new Date(input.plannedFrom).getTime() > new Date(input.plannedTo).getTime()) {
    throw new Error("plannedFrom must not be after plannedTo");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    fieldId: input.fieldId,
    campaignId: input.campaignId,
    cropCode: input.cropCode.trim().toUpperCase(),
    operationType: "harvest",
    plannedAreaHa: input.plannedAreaHa,
    plannedFrom: input.plannedFrom,
    plannedTo: input.plannedTo,
    status: "planned",
    revision: 1
  };
}

export function transitionAgriculturalOperation(
  current: AgriculturalOperation,
  expectedRevision: number,
  nextStatus: AgriculturalOperationStatus
): AgriculturalOperation {
  if (current.revision !== expectedRevision) {
    throw new RevisionConflictError(expectedRevision, current.revision);
  }

  if (!transitions[current.status].includes(nextStatus)) {
    throw new Error(`Invalid transition: ${current.status} -> ${nextStatus}`);
  }

  return {
    ...current,
    status: nextStatus,
    revision: current.revision + 1
  };
}
