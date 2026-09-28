import { describe, expect, it } from "vitest";
import {
  createGrainTransfer,
  createSessionPrimaryGrainBatch
} from "../domain/harvest/grain-flow";

describe("grain flow", () => {
  it("uses the WorkSession id as the deterministic primary batch id", () => {
    expect(
      createSessionPrimaryGrainBatch({
        workSessionId: "11111111-1111-1111-1111-111111111111",
        agriculturalOperationId: "22222222-2222-2222-2222-222222222222"
      })
    ).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      agriculturalOperationId: "22222222-2222-2222-2222-222222222222",
      sourceWorkSessionId: "11111111-1111-1111-1111-111111111111",
      batchKey: "session_primary",
      status: "open"
    });
  });

  it("normalizes tonnes to kilograms while preserving the observed unit", () => {
    expect(
      createGrainTransfer({
        id: "33333333-3333-3333-3333-333333333333",
        grainBatchId: "11111111-1111-1111-1111-111111111111",
        workSessionId: "11111111-1111-1111-1111-111111111111",
        sourceEquipmentId: "source",
        destinationEquipmentId: "destination",
        quantityValue: 8.5,
        quantityUnit: "t",
        occurredAt: "2026-09-27T18:00:00-03:00"
      })
    ).toMatchObject({
      quantityValue: 8.5,
      quantityUnit: "t",
      quantityKg: 8500,
      provenance: "estimated"
    });
  });

  it("rejects a transfer to the same equipment", () => {
    expect(() =>
      createGrainTransfer({
        grainBatchId: "batch",
        workSessionId: "session",
        sourceEquipmentId: "same",
        destinationEquipmentId: "same",
        quantityValue: 1000,
        quantityUnit: "kg",
        occurredAt: "2026-09-27T18:00:00-03:00"
      })
    ).toThrow(/must differ/);
  });

  it("rejects non-positive grain quantity", () => {
    expect(() =>
      createGrainTransfer({
        grainBatchId: "batch",
        workSessionId: "session",
        sourceEquipmentId: "source",
        destinationEquipmentId: "destination",
        quantityValue: 0,
        quantityUnit: "kg",
        occurredAt: "2026-09-27T18:00:00-03:00"
      })
    ).toThrow(/greater than 0/);
  });
});
