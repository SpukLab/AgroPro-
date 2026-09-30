import { describe, expect, it } from "vitest";
import {
  createTransportDriver,
  createTransportTrip
} from "../domain/transport/trip";

describe("transport trip domain", () => {
  it("creates a normalized active driver", () => {
    expect(
      createTransportDriver({
        id: "11111111-1111-1111-1111-111111111111",
        displayName: " Juan Pérez ",
        licenseRef: " LIC-123 "
      })
    ).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      displayName: "Juan Pérez",
      licenseRef: "LIC-123",
      status: "active"
    });
  });

  it("creates a loaded trip tied to load, vehicle and driver", () => {
    expect(
      createTransportTrip({
        id: "22222222-2222-2222-2222-222222222222",
        loadId: "load-1",
        sourceWorkSessionId: "session-1",
        vehicleId: "vehicle-1",
        driverId: "driver-1",
        originLabel: " Lote 2 ",
        destinationLabel: " Acopio Centro ",
        plannedDepartureAt: "2026-09-30T10:30:00-03:00"
      })
    ).toEqual({
      id: "22222222-2222-2222-2222-222222222222",
      loadId: "load-1",
      sourceWorkSessionId: "session-1",
      vehicleId: "vehicle-1",
      driverId: "driver-1",
      originLabel: "Lote 2",
      destinationLabel: "Acopio Centro",
      plannedDepartureAt: "2026-09-30T10:30:00-03:00",
      status: "loaded",
      revision: 1
    });
  });

  it("rejects a trip without destination", () => {
    expect(() =>
      createTransportTrip({
        loadId: "load-1",
        sourceWorkSessionId: "session-1",
        vehicleId: "vehicle-1",
        driverId: "driver-1",
        originLabel: "Lote 2",
        destinationLabel: " ",
        plannedDepartureAt: "2026-09-30T10:30:00-03:00"
      })
    ).toThrow(/destinationLabel is required/);
  });
});
