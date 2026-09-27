export type ContractorJobStatus =
  | "planned"
  | "ready"
  | "active"
  | "completed"
  | "cancelled";

export interface ContractorJob {
  id: string;
  agriculturalOperationId: string;
  operationalTeamId?: string;
  status: ContractorJobStatus;
  revision: number;
}

export type WorkSessionStatus = "active" | "completed" | "cancelled";

export interface WorkSession {
  id: string;
  contractorJobId: string;
  operationalTeamId?: string;
  startedAt: string;
  endedAt?: string;
  status: WorkSessionStatus;
  revision: number;
}

export class WorkSessionRevisionConflictError extends Error {
  constructor(expected: number, actual: number) {
    super(`Revision conflict: expected ${expected}, actual ${actual}`);
    this.name = "WorkSessionRevisionConflictError";
  }
}

export function createContractorJob(input: {
  id?: string;
  agriculturalOperationId: string;
  operationalTeamId?: string;
}): ContractorJob {
  if (!input.agriculturalOperationId.trim()) {
    throw new Error("agriculturalOperationId is required");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    agriculturalOperationId: input.agriculturalOperationId,
    operationalTeamId: input.operationalTeamId,
    status: "ready",
    revision: 1
  };
}

export function startWorkSession(input: {
  id?: string;
  contractorJobId: string;
  operationalTeamId?: string;
  startedAt: string;
}): WorkSession {
  if (!input.contractorJobId.trim()) {
    throw new Error("contractorJobId is required");
  }

  if (!Number.isFinite(new Date(input.startedAt).getTime())) {
    throw new Error("startedAt must be a valid timestamp");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    contractorJobId: input.contractorJobId,
    operationalTeamId: input.operationalTeamId,
    startedAt: input.startedAt,
    status: "active",
    revision: 1
  };
}

export function closeWorkSession(
  current: WorkSession,
  expectedRevision: number,
  endedAt: string
): WorkSession {
  if (current.revision !== expectedRevision) {
    throw new WorkSessionRevisionConflictError(expectedRevision, current.revision);
  }

  if (current.status !== "active") {
    throw new Error(`Cannot close work session from ${current.status}`);
  }

  const end = new Date(endedAt).getTime();
  const start = new Date(current.startedAt).getTime();

  if (!Number.isFinite(end) || end < start) {
    throw new Error("endedAt must not be before startedAt");
  }

  return {
    ...current,
    endedAt,
    status: "completed",
    revision: current.revision + 1
  };
}


export interface EndWorkSessionPayload {
  sessionId: string;
  expectedRevision: number;
  endedAt: string;
}

export function createEndWorkSessionPayload(input: {
  sessionId: string;
  startedAt: string;
  expectedRevision: number;
  endedAt: string;
}): EndWorkSessionPayload {
  if (!input.sessionId.trim()) {
    throw new Error("sessionId is required");
  }

  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision <= 0) {
    throw new Error("expectedRevision must be a positive integer");
  }

  const start = new Date(input.startedAt).getTime();
  const end = new Date(input.endedAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("endedAt must not be before startedAt");
  }

  return {
    sessionId: input.sessionId,
    expectedRevision: input.expectedRevision,
    endedAt: input.endedAt
  };
}
