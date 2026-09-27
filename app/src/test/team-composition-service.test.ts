import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  queueEndTeamAssignment,
  queueReplaceTeamMember,
  queueTeamMember
} from "../application/operations/team-composition-service";
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

  it("queues replacement as close + new resource + dependent new assignment", async () => {
    const queued = await queueReplaceTeamMember({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      operationalTeamId: "team-1",
      previous: {
        assignmentId: "old-assignment",
        subjectKind: "person",
        subjectId: "old-person",
        displayName: "Operador mañana",
        role: "harvester_operator",
        validFrom: "2026-09-27T08:00:00-03:00"
      },
      replacementDisplayName: "Operador tarde",
      effectiveAt: "2026-09-27T14:00:00-03:00"
    });

    const [endId, resourceId, assignmentId] = queued.commandIds;
    const end = await surkaraDb.outbox.get(endId);
    const resource = await surkaraDb.outbox.get(resourceId);
    const assignment = await surkaraDb.outbox.get(assignmentId);

    expect(end?.commandType).toBe("operations.end_team_assignment");
    expect(end?.dependencies).toEqual([]);

    expect(resource?.commandType).toBe("operations.create_team_person");
    expect(resource?.dependencies).toEqual([]);

    expect(assignment?.commandType).toBe("operations.assign_team_member");
    expect(assignment?.dependencies).toEqual([endId, resourceId]);
    expect(assignment?.payload).toMatchObject({
      operationalTeamId: "team-1",
      role: "harvester_operator",
      validFrom: new Date("2026-09-27T14:00:00-03:00").toISOString()
    });

    expect(queued.replacement).toMatchObject({
      displayName: "Operador tarde",
      role: "harvester_operator",
      pendingStart: true
    });
  });

  it("queues assignment closure as a single offline command", async () => {
    const command = await queueEndTeamAssignment({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      operationalTeamId: "team-1",
      assignmentId: "assignment-1",
      validFrom: "2026-09-27T08:00:00-03:00",
      validTo: "2026-09-27T12:00:00-03:00",
      reason: "Cambio de operador"
    });

    const stored = await surkaraDb.outbox.get(command.clientOperationId);

    expect(stored?.commandType).toBe("operations.end_team_assignment");
    expect(stored?.targetRef).toBe("assignment-1");
    expect(stored?.dependencies).toEqual([]);
    expect(stored?.payload).toMatchObject({
      assignmentId: "assignment-1",
      operationalTeamId: "team-1",
      reason: "Cambio de operador"
    });
  });
});
