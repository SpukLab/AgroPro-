import { describe, expect, it } from "vitest";
import {
  createTransportLoad,
  createTransportVehicle
} from "../domain/transport/load";

describe("transport load domain", () => {
  it("creates a normalized active truck", () => {
    expect(
      createTransportVehicle({
        id: "11111111-1111-1111-1111-111111111111",
        displayName: " Camión 12 ",
        plate: "aa123bb"
      })
    ).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      vehicleKind: "truck",
      displayName: "Camión 12",
      plate: "AA123BB",
      status: "active"
    });
  });

  it("normalizes tonnes to kilograms on load", () => {
    expect(
      createTransportLoad({
        id: "22222222-2222-2222-2222-222222222222",
        grainBatchId: "batch",
        sourceWorkSessionId: "session",
        sourceEquipmentId: "grain-cart",
        vehicleId: "truck",
        quantityValue: 28.5,
        quantityUnit: "t",
        loadedAt: "2026-09-28T16:30:00-03:00"
      })
    ).toMatchObject({
      quantityValue: 28.5,
      quantityUnit: "t",
      quantityKg: 28500,
      provenance: "estimated",
      status: "loaded"
    });
  });

  it("rejects a non-positive load quantity", () => {
    expect(() =>
      createTransportLoad({
        grainBatchId: "batch",
        sourceWorkSessionId: "session",
        sourceEquipmentId: "grain-cart",
        vehicleId: "truck",
        quantityValue: 0,
        quantityUnit: "kg",
        loadedAt: "2026-09-28T16:30:00-03:00"
      })
    ).toThrow(/greater than 0/);
  });
});
