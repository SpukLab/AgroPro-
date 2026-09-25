import { describe, expect, it } from "vitest";
import {
  RevisionConflictError,
  createHarvestOperation,
  transitionAgriculturalOperation
} from "../domain/operations/agricultural-operation";

describe("AgriculturalOperation", () => {
  it("keeps planned data distinct and starts at revision 1", () => {
    const operation = createHarvestOperation({
      id: "operation-1",
      fieldId: "field-1",
      campaignId: "campaign-1",
      cropId: "soy",
      plannedAreaHa: 180,
      plannedFrom: "2026-09-24T10:00:00-03:00",
      plannedTo: "2026-09-25T18:00:00-03:00"
    });

    expect(operation.plannedAreaHa).toBe(180);
    expect(operation.status).toBe("planned");
    expect(operation.revision).toBe(1);
  });

  it("rejects stale state transitions instead of last-write-wins", () => {
    const operation = createHarvestOperation({
      id: "operation-1",
      fieldId: "field-1",
      campaignId: "campaign-1",
      cropId: "soy",
      plannedAreaHa: 180,
      plannedFrom: "2026-09-24T10:00:00-03:00",
      plannedTo: "2026-09-25T18:00:00-03:00"
    });

    const ready = transitionAgriculturalOperation(operation, 1, "ready");

    expect(() =>
      transitionAgriculturalOperation(ready, 1, "active")
    ).toThrow(RevisionConflictError);
  });
});
