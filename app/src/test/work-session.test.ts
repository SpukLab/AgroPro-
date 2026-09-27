import { describe, expect, it } from "vitest";
import {
  WorkSessionRevisionConflictError,
  closeWorkSession,
  createContractorJob,
  startWorkSession
} from "../domain/operations/work-session";

describe("WorkSession", () => {
  it("links execution to the agronomic operation through ContractorJob", () => {
    const job = createContractorJob({
      id: "job-1",
      agriculturalOperationId: "operation-1",
      operationalTeamId: "team-1"
    });

    const session = startWorkSession({
      id: "session-1",
      contractorJobId: job.id,
      operationalTeamId: job.operationalTeamId,
      startedAt: "2026-09-27T08:00:00-03:00"
    });

    expect(job.status).toBe("ready");
    expect(session.status).toBe("active");
    expect(session.operationalTeamId).toBe("team-1");
  });

  it("closes with revision increment and rejects stale close", () => {
    const session = startWorkSession({
      id: "session-1",
      contractorJobId: "job-1",
      startedAt: "2026-09-27T08:00:00-03:00"
    });

    const closed = closeWorkSession(
      session,
      1,
      "2026-09-27T18:00:00-03:00"
    );

    expect(closed.status).toBe("completed");
    expect(closed.revision).toBe(2);

    expect(() =>
      closeWorkSession(closed, 1, "2026-09-27T19:00:00-03:00")
    ).toThrow(WorkSessionRevisionConflictError);
  });
});
