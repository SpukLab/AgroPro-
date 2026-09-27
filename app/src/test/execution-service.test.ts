import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { queueExecutionStart } from "../application/operations/execution-service";
import { clearLocalDataForTests } from "../infra/local/outbox";
import { surkaraDb } from "../infra/local/db";

beforeEach(async () => {
  await clearLocalDataForTests();
});

describe("queueExecutionStart", () => {
  it("queues team -> contractor job -> work session with stable dependencies", async () => {
    const queued = await queueExecutionStart({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      agriculturalOperationId: "operation-1",
      teamName: "Equipo Cosecha A",
      startedAt: "2026-09-27T08:00:00-03:00"
    });

    const [teamCommandId, jobCommandId, sessionCommandId] = queued.commandIds;
    const [team, job, session] = await surkaraDb.outbox.bulkGet([
      teamCommandId,
      jobCommandId,
      sessionCommandId
    ]);

    expect(team?.commandType).toBe("operations.create_operational_team");
    expect(team?.dependencies).toEqual([]);

    expect(job?.commandType).toBe("contractor.create_job");
    expect(job?.dependencies).toEqual([teamCommandId]);
    expect(job?.payload).toMatchObject({
      agriculturalOperationId: "operation-1",
      operationalTeamId: queued.team.id
    });

    expect(session?.commandType).toBe("contractor.start_work_session");
    expect(session?.dependencies).toEqual([jobCommandId]);
    expect(session?.payload).toMatchObject({
      contractorJobId: queued.job.id,
      operationalTeamId: queued.team.id
    });
  });
});
