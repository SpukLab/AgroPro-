import { describe, expect, it } from "vitest";
import { createTransportUnloadResult } from "../domain/transport/unload";

describe("transport unload domain", () => {
  it("normalizes tonnes while preserving ticket and moisture", () => {
    expect(
      createTransportUnloadResult({
        id: "11111111-1111-1111-1111-111111111111",
        tripId: "trip-1",
        loadId: "load-1",
        destinationLabel: " Acopio Centro ",
        quantityValue: 9.8,
        quantityUnit: "t",
        provenance: "scale",
        unloadedAt: "2026-09-30T12:30:00-03:00",
        moisturePercent: 13.5,
        ticketRef: " TKT-1024 "
      })
    ).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      tripId: "trip-1",
      loadId: "load-1",
      destinationLabel: "Acopio Centro",
      quantityValue: 9.8,
      quantityUnit: "t",
      quantityKg: 9800,
      provenance: "scale",
      unloadedAt: "2026-09-30T12:30:00-03:00",
      moisturePercent: 13.5,
      ticketRef: "TKT-1024",
      note: undefined,
      status: "delivered"
    });
  });

  it("rejects invalid moisture", () => {
    expect(() =>
      createTransportUnloadResult({
        tripId: "trip-1",
        loadId: "load-1",
        destinationLabel: "Acopio",
        quantityValue: 9800,
        quantityUnit: "kg",
        unloadedAt: "2026-09-30T12:30:00-03:00",
        moisturePercent: 101
      })
    ).toThrow(/moisturePercent/);
  });
});
