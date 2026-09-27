import { describe, expect, it } from "vitest";
import {
  assignmentsEffectiveAt,
  createOperationalTeam,
  createTeamAssignment
} from "../domain/operations/operational-team";

describe("OperationalTeam", () => {
  it("keeps a composed harvest team independent from individual resources", () => {
    const team = createOperationalTeam({
      id: "team-1",
      name: "Equipo Cosecha A",
      teamType: "harvest"
    });

    expect(team).toEqual({
      id: "team-1",
      name: "Equipo Cosecha A",
      teamType: "harvest",
      revision: 1
    });
  });

  it("reconstructs operator rotation by effective interval", () => {
    const assignments = [
      createTeamAssignment({
        id: "assignment-a",
        operationalTeamId: "team-1",
        subject: { kind: "person", partyId: "operator-a" },
        role: "harvester_operator",
        validFrom: "2026-09-27T08:00:00-03:00",
        validTo: "2026-09-27T14:00:00-03:00"
      }),
      createTeamAssignment({
        id: "assignment-b",
        operationalTeamId: "team-1",
        subject: { kind: "person", partyId: "operator-b" },
        role: "harvester_operator",
        validFrom: "2026-09-27T14:00:00-03:00"
      }),
      createTeamAssignment({
        id: "assignment-machine",
        operationalTeamId: "team-1",
        subject: { kind: "equipment", equipmentId: "harvester-1" },
        role: "harvester",
        validFrom: "2026-09-27T08:00:00-03:00"
      })
    ];

    expect(
      assignmentsEffectiveAt(assignments, "2026-09-27T12:00:00-03:00").map(
        (item) => item.id
      )
    ).toEqual(["assignment-a", "assignment-machine"]);

    expect(
      assignmentsEffectiveAt(assignments, "2026-09-27T16:00:00-03:00").map(
        (item) => item.id
      )
    ).toEqual(["assignment-b", "assignment-machine"]);
  });

  it("rejects inverted effective intervals", () => {
    expect(() =>
      createTeamAssignment({
        operationalTeamId: "team-1",
        subject: { kind: "equipment", equipmentId: "tractor-1" },
        role: "tractor",
        validFrom: "2026-09-27T14:00:00-03:00",
        validTo: "2026-09-27T08:00:00-03:00"
      })
    ).toThrow(/validTo/);
  });
});
