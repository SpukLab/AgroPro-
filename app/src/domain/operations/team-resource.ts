export type EquipmentType =
  | "harvester"
  | "tractor"
  | "grain_cart"
  | "truck"
  | "implement"
  | "other";

export interface EquipmentResource {
  id: string;
  equipmentType: EquipmentType;
  displayName: string;
  make?: string;
  model?: string;
  serialNumber?: string;
}

export interface TeamPerson {
  id: string;
  displayName: string;
}

export type TeamMemberRole =
  | "harvester"
  | "tractor"
  | "grain_cart"
  | "harvester_operator"
  | "tractor_operator"
  | "support_operator"
  | "other";

export interface TeamMemberAssignment {
  id: string;
  operationalTeamId: string;
  subjectKind: "person" | "equipment";
  partyId?: string;
  equipmentId?: string;
  role: TeamMemberRole;
  validFrom: string;
  validTo?: string;
  reason?: string;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function createEquipmentResource(input: {
  id?: string;
  equipmentType: EquipmentType;
  displayName: string;
  make?: string;
  model?: string;
  serialNumber?: string;
}): EquipmentResource {
  return {
    id: input.id ?? crypto.randomUUID(),
    equipmentType: input.equipmentType,
    displayName: required(input.displayName, "displayName"),
    make: optional(input.make),
    model: optional(input.model),
    serialNumber: optional(input.serialNumber)
  };
}

export function createTeamPerson(input: {
  id?: string;
  displayName: string;
}): TeamPerson {
  return {
    id: input.id ?? crypto.randomUUID(),
    displayName: required(input.displayName, "displayName")
  };
}

export function createTeamMemberAssignment(input: {
  id?: string;
  operationalTeamId: string;
  subjectKind: "person" | "equipment";
  partyId?: string;
  equipmentId?: string;
  role: TeamMemberRole;
  validFrom: string;
  validTo?: string;
  reason?: string;
}): TeamMemberAssignment {
  const started = new Date(input.validFrom).getTime();
  const ended = input.validTo ? new Date(input.validTo).getTime() : undefined;

  if (!Number.isFinite(started)) {
    throw new Error("validFrom must be a valid timestamp");
  }
  if (ended !== undefined && (!Number.isFinite(ended) || ended < started)) {
    throw new Error("validTo must not be before validFrom");
  }

  if (input.subjectKind === "person") {
    if (!input.partyId || input.equipmentId) {
      throw new Error("person assignment requires partyId only");
    }
  } else if (!input.equipmentId || input.partyId) {
    throw new Error("equipment assignment requires equipmentId only");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    operationalTeamId: required(input.operationalTeamId, "operationalTeamId"),
    subjectKind: input.subjectKind,
    partyId: input.partyId,
    equipmentId: input.equipmentId,
    role: input.role,
    validFrom: input.validFrom,
    validTo: input.validTo,
    reason: optional(input.reason)
  };
}


export interface EndTeamAssignmentPayload {
  assignmentId: string;
  operationalTeamId: string;
  validTo: string;
  reason?: string;
}

export function createEndTeamAssignmentPayload(input: {
  assignmentId: string;
  operationalTeamId: string;
  validFrom: string;
  validTo: string;
  reason?: string;
}): EndTeamAssignmentPayload {
  const from = new Date(input.validFrom).getTime();
  const to = new Date(input.validTo).getTime();

  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    throw new Error("validTo must not be before validFrom");
  }

  return {
    assignmentId: required(input.assignmentId, "assignmentId"),
    operationalTeamId: required(input.operationalTeamId, "operationalTeamId"),
    validTo: input.validTo,
    reason: optional(input.reason)
  };
}
