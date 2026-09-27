import {
  createOperationalTeam,
  type OperationalTeam
} from "../../domain/operations/operational-team";
import {
  createContractorJob,
  createEndWorkSessionPayload,
  startWorkSession,
  type ContractorJob,
  type EndWorkSessionPayload,
  type WorkSession
} from "../../domain/operations/work-session";
import type { OfflineCommand } from "../../domain/sync/types";
import { enqueueCommand } from "../../infra/local/outbox";

export interface QueueExecutionInput {
  actorId: string;
  organizationId: string;
  deviceId: string;
  agriculturalOperationId: string;
  teamName: string;
  startedAt: string;
}

export interface QueuedExecution {
  team: OperationalTeam;
  job: ContractorJob;
  session: WorkSession;
  commandIds: [string, string, string];
}

function baseCommand(input: {
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
    conflictClass: "C" as const,
    evidenceRefs: [] as string[],
    schemaVersion: 1 as const
  };
}

export async function queueExecutionStart(
  input: QueueExecutionInput
): Promise<QueuedExecution> {
  const team = createOperationalTeam({
    name: input.teamName,
    teamType: "harvest"
  });
  const job = createContractorJob({
    agriculturalOperationId: input.agriculturalOperationId,
    operationalTeamId: team.id
  });
  const session = startWorkSession({
    contractorJobId: job.id,
    operationalTeamId: team.id,
    startedAt: input.startedAt
  });

  const common = baseCommand(input);
  const teamCommandId = crypto.randomUUID();
  const jobCommandId = crypto.randomUUID();
  const sessionCommandId = crypto.randomUUID();

  const teamCommand: OfflineCommand<OperationalTeam> = {
    ...common,
    clientOperationId: teamCommandId,
    commandType: "operations.create_operational_team",
    targetRef: team.id,
    payload: team,
    dependencies: []
  };

  const jobCommand: OfflineCommand<ContractorJob> = {
    ...common,
    clientOperationId: jobCommandId,
    commandType: "contractor.create_job",
    targetRef: job.id,
    payload: job,
    dependencies: [teamCommandId]
  };

  const sessionCommand: OfflineCommand<WorkSession> = {
    ...common,
    clientOperationId: sessionCommandId,
    commandType: "contractor.start_work_session",
    targetRef: session.id,
    payload: session,
    dependencies: [jobCommandId]
  };

  await enqueueCommand(teamCommand);
  await enqueueCommand(jobCommand);
  await enqueueCommand(sessionCommand);

  return {
    team,
    job,
    session,
    commandIds: [teamCommandId, jobCommandId, sessionCommandId]
  };
}


export async function queueEndWorkSession(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  sessionId: string;
  startedAt: string;
  expectedRevision: number;
  endedAt: string;
}): Promise<OfflineCommand<EndWorkSessionPayload>> {
  const payload = createEndWorkSessionPayload({
    sessionId: input.sessionId,
    startedAt: input.startedAt,
    expectedRevision: input.expectedRevision,
    endedAt: input.endedAt
  });

  const common = baseCommand(input);
  const command: OfflineCommand<EndWorkSessionPayload> = {
    ...common,
    clientOperationId: crypto.randomUUID(),
    commandType: "contractor.end_work_session",
    targetRef: input.sessionId,
    baseRevision: input.expectedRevision,
    payload,
    dependencies: []
  };

  await enqueueCommand(command);
  return command;
}


export async function queueExistingWorkSessionStart(input: {
  actorId: string;
  organizationId: string;
  deviceId: string;
  contractorJobId: string;
  operationalTeamId: string;
  startedAt: string;
}): Promise<OfflineCommand<WorkSession>> {
  const session = startWorkSession({
    contractorJobId: input.contractorJobId,
    operationalTeamId: input.operationalTeamId,
    startedAt: input.startedAt
  });

  const common = baseCommand(input);
  const command: OfflineCommand<WorkSession> = {
    ...common,
    clientOperationId: crypto.randomUUID(),
    commandType: "contractor.start_work_session",
    targetRef: session.id,
    payload: session,
    dependencies: []
  };

  await enqueueCommand(command);
  return command;
}
