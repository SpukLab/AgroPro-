import { describe, expect, it } from "vitest";
import {
  createGrainStorageReceipt,
  createGrainStorageUnit
} from "../domain/storage/grain-storage";

describe("grain storage domain", () => {
  it("creates a typed active storage unit", () => {
    expect(
      createGrainStorageUnit({
        id: "11111111-1111-1111-1111-111111111111",
        storageKind: "silobag",
        displayName: " Silobolsa norte 1 "
      })
    ).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      storageKind: "silobag",
      displayName: "Silobolsa norte 1",
      status: "active"
    });
  });

  it("normalizes tonnes to kilograms on storage receipt", () => {
    expect(
      createGrainStorageReceipt({
        id: "22222222-2222-2222-2222-222222222222",
        grainBatchId: "batch",
        sourceWorkSessionId: "session",
        sourceEquipmentId: "grain-cart",
        storageUnitId: "storage",
        quantityValue: 20,
        quantityUnit: "t",
        receivedAt: "2026-09-28T16:45:00-03:00"
      })
    ).toMatchObject({
      quantityValue: 20,
      quantityUnit: "t",
      quantityKg: 20000,
      provenance: "estimated",
      status: "stored"
    });
  });

  it("rejects a non-positive stored quantity", () => {
    expect(() =>
      createGrainStorageReceipt({
        grainBatchId: "batch",
        sourceWorkSessionId: "session",
        sourceEquipmentId: "grain-cart",
        storageUnitId: "storage",
        quantityValue: 0,
        quantityUnit: "kg",
        receivedAt: "2026-09-28T16:45:00-03:00"
      })
    ).toThrow(/greater than 0/);
  });
});
