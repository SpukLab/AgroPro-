export type OperationalTeamType =
  | "harvest"
  | "seeding"
  | "spraying"
  | "maintenance"
  | "other";

export interface OperationalTeam {
  id: string;
  name: string;
  teamType: OperationalTeamType;
  revision: number;
}

export type TeamAssignmentSubject =
  | { kind: "person"; partyId: string }
  | { kind: "equipment"; equipmentId: string };

export interface TeamAssignment {
  id: string;
  operationalTeamId: string;
  subject: TeamAssignmentSubject;
  role: string;
  validFrom: string;
  validTo?: string;
  reason?: string;
}

export interface CreateOperationalTeamInput {
  id?: string;
  name: string;
  teamType: OperationalTeamType;
}

export interface CreateTeamAssignmentInput {
  id?: string;
  operationalTeamId: string;
  subject: TeamAssignmentSubject;
  role: string;
  validFrom: string;
  validTo?: string;
  reason?: string;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function timestamp(value: string, field: string): number {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return parsed;
}

export function createOperationalTeam(
  input: CreateOperationalTeamInput
): OperationalTeam {
  return {
    id: input.id ?? crypto.randomUUID(),
    name: requireText(input.name, "name"),
    teamType: input.teamType,
    revision: 1
  };
}

export function createTeamAssignment(
  input: CreateTeamAssignmentInput
): TeamAssignment {
  const from = timestamp(input.validFrom, "validFrom");
  const to = input.validTo ? timestamp(input.validTo, "validTo") : undefined;

  if (to !== undefined && to < from) {
    throw new Error("validTo must not be before validFrom");
  }

  const subject =
    input.subject.kind === "person"
      ? {
          kind: "person" as const,
          partyId: requireText(input.subject.partyId, "partyId")
        }
      : {
          kind: "equipment" as const,
          equipmentId: requireText(input.subject.equipmentId, "equipmentId")
        };

  return {
    id: input.id ?? crypto.randomUUID(),
    operationalTeamId: requireText(input.operationalTeamId, "operationalTeamId"),
    subject,
    role: requireText(input.role, "role"),
    validFrom: input.validFrom,
    validTo: input.validTo,
    reason: input.reason?.trim() || undefined
  };
}

export function assignmentsEffectiveAt(
  assignments: TeamAssignment[],
  at: string
): TeamAssignment[] {
  const point = timestamp(at, "at");

  return assignments.filter((assignment) => {
    const from = timestamp(assignment.validFrom, "validFrom");
    const to = assignment.validTo
      ? timestamp(assignment.validTo, "validTo")
      : Number.POSITIVE_INFINITY;

    return from <= point && point < to;
  });
}
