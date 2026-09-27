import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { queueTeamMember } from "../application/operations/team-composition-service";
import { clearLocalDataForTests } from "../infra/local/outbox";
import { surkaraDb } from "../infra/local/db";

beforeEach(async () => {
  await clearLocalDataForTests();
});

describe("queueTeamMember", () => {
  it("queues equipment then assignment with dependency", async () => {
    const queued = await queueTeamMember({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      operationalTeamId: "team-1",
      kind: "equipment",
      equipmentType: "grain_cart",
      displayName: "Monotolva 1",
      role: "grain_cart",
      validFrom: "2026-09-27T08:00:00-03:00"
    });

    const [resourceId, assignmentId] = queued.commandIds;
    const resource = await surkaraDb.outbox.get(resourceId);
    const assignment = await surkaraDb.outbox.get(assignmentId);

    expect(resource?.commandType).toBe("operations.create_equipment");
    expect(assignment?.commandType).toBe("operations.assign_team_member");
    expect(assignment?.dependencies).toEqual([resourceId]);
  });

  it("queues person then assignment with dependency", async () => {
    const queued = await queueTeamMember({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      operationalTeamId: "team-1",
      kind: "person",
      displayName: "Operador 1",
      role: "harvester_operator",
      validFrom: "2026-09-27T08:00:00-03:00"
    });

    const [resourceId, assignmentId] = queued.commandIds;
    const resource = await surkaraDb.outbox.get(resourceId);
    const assignment = await surkaraDb.outbox.get(assignmentId);

    expect(resource?.commandType).toBe("operations.create_team_person");
    expect(assignment?.commandType).toBe("operations.assign_team_member");
    expect(assignment?.dependencies).toEqual([resourceId]);
  });
});
