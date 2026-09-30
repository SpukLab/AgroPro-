import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  queueTransportLoad,
  queueTransportVehicle
} from "../application/transport/load-service";
import {
  queueTransportDriver,
  queueTransportTrip
} from "../application/transport/trip-service";
import { clearLocalDataForTests } from "../infra/local/outbox";
import { surkaraDb } from "../infra/local/db";

beforeEach(async () => {
  await clearLocalDataForTests();
});

describe("transport trip service", () => {
  it("chains pending load, vehicle and driver before an offline trip", async () => {
    const vehicle = await queueTransportVehicle({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      displayName: "Camión 1"
    });

    const load = await queueTransportLoad({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      agriculturalOperationId: "22222222-2222-2222-2222-222222222222",
      sourceEquipmentId: "grain-cart-1",
      vehicleId: vehicle.payload.id,
      quantityValue: 10,
      quantityUnit: "t",
      provenance: "estimated",
      loadedAt: "2026-09-30T10:00:00-03:00"
    });

    const driver = await queueTransportDriver({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      displayName: "Juan Pérez"
    });

    const trip = await queueTransportTrip({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      loadId: load.payload.id,
      driverId: driver.payload.id,
      originLabel: "Lote 2",
      destinationLabel: "Acopio Centro",
      plannedDepartureAt: "2026-09-30T10:30:00-03:00"
    });

    const commands = await surkaraDb.outbox.toArray();
    const storedTrip = commands.find(
      (item) => item.clientOperationId === trip.clientOperationId
    );

    expect(storedTrip?.commandType).toBe("transport.create_trip");
    expect(storedTrip?.dependencies).toEqual(
      expect.arrayContaining([
        vehicle.clientOperationId,
        load.clientOperationId,
        driver.clientOperationId
      ])
    );
    expect(storedTrip?.payload).toMatchObject({
      loadId: load.payload.id,
      vehicleId: vehicle.payload.id,
      driverId: driver.payload.id,
      originLabel: "Lote 2",
      destinationLabel: "Acopio Centro",
      status: "loaded",
      revision: 1
    });
  });
});
