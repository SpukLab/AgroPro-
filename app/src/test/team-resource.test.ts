import { describe, expect, it } from "vitest";
import {
  createEquipmentResource,
  createTeamMemberAssignment,
  createTeamPerson
} from "../domain/operations/team-resource";

describe("team resources", () => {
  it("models harvester, tractor and grain cart as distinct equipment", () => {
    expect(
      createEquipmentResource({
        id: "harvester-1",
        equipmentType: "harvester",
        displayName: "Cosechadora 1"
      }).equipmentType
    ).toBe("harvester");

    expect(
      createEquipmentResource({
        id: "tractor-1",
        equipmentType: "tractor",
        displayName: "Tractor 1"
      }).equipmentType
    ).toBe("tractor");

    expect(
      createEquipmentResource({
        id: "cart-1",
        equipmentType: "grain_cart",
        displayName: "Monotolva 1"
      }).equipmentType
    ).toBe("grain_cart");
  });

  it("keeps people separate from equipment assignments", () => {
    const person = createTeamPerson({ id: "person-1", displayName: "Operador 1" });

    const assignment = createTeamMemberAssignment({
      id: "assignment-1",
      operationalTeamId: "team-1",
      subjectKind: "person",
      partyId: person.id,
      role: "harvester_operator",
      validFrom: "2026-09-27T08:00:00-03:00"
    });

    expect(assignment.partyId).toBe("person-1");
    expect(assignment.equipmentId).toBeUndefined();
  });

  it("rejects ambiguous assignment subjects", () => {
    expect(() =>
      createTeamMemberAssignment({
        operationalTeamId: "team-1",
        subjectKind: "equipment",
        partyId: "person-1",
        equipmentId: "tractor-1",
        role: "tractor",
        validFrom: "2026-09-27T08:00:00-03:00"
      })
    ).toThrow(/equipment assignment/);
  });
});
