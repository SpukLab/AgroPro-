import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  queueTransportLoad,
  queueTransportVehicle
} from "../application/transport/load-service";
import {
  listTransportTrips,
  queueArriveTransportTrip,
  queueDepartTransportTrip,
  queueStartUnloadingTransportTrip,
  queueTransportDriver,
  queueTransportTrip
} from "../application/transport/trip-service";
import {
  listTransportUnloadResults,
  queueCompleteTransportUnload
} from "../application/transport/unload-service";
import { clearLocalDataForTests } from "../infra/local/outbox";
import { surkaraDb } from "../infra/local/db";

beforeEach(async () => {
  await clearLocalDataForTests();
});

describe("transport unload service", () => {
  it("chains unload after offline trip lifecycle and projects delivered", async () => {
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
      loadedAt: "2026-09-30T09:00:00-03:00"
    });

    const driver = await queueTransportDriver({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      displayName: "Juan"
    });

    const trip = await queueTransportTrip({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      loadId: load.payload.id,
      driverId: driver.payload.id,
      originLabel: "Lote 2",
      destinationLabel: "Acopio",
      plannedDepartureAt: "2026-09-30T09:30:00-03:00"
    });

    await queueDepartTransportTrip({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      tripId: trip.payload.id,
      departedAt: "2026-09-30T09:35:00-03:00"
    });

    await queueArriveTransportTrip({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      tripId: trip.payload.id,
      arrivedAt: "2026-09-30T10:35:00-03:00"
    });

    const startUnload = await queueStartUnloadingTransportTrip({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      tripId: trip.payload.id,
      unloadingStartedAt: "2026-09-30T10:50:00-03:00"
    });

    const unload = await queueCompleteTransportUnload({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      tripId: trip.payload.id,
      quantityValue: 9.8,
      quantityUnit: "t",
      provenance: "scale",
      unloadedAt: "2026-09-30T11:00:00-03:00",
      moisturePercent: 13.5,
      ticketRef: "TKT-1024"
    });

    const commands = await surkaraDb.outbox.toArray();
    const storedUnload = commands.find(
      (item) => item.clientOperationId === unload.clientOperationId
    );

    expect(storedUnload?.commandType).toBe("transport.complete_unload");
    expect(storedUnload?.dependencies).toEqual([
      startUnload.clientOperationId
    ]);
    expect(storedUnload?.payload).toMatchObject({
      tripId: trip.payload.id,
      loadId: load.payload.id,
      expectedRevision: 4,
      quantityValue: 9.8,
      quantityKg: 9800,
      moisturePercent: 13.5,
      ticketRef: "TKT-1024",
      status: "delivered"
    });

    const trips = await listTransportTrips(
      "org-1",
      "11111111-1111-1111-1111-111111111111"
    );
    expect(trips[0]).toMatchObject({
      id: trip.payload.id,
      status: "delivered",
      revision: 5,
      syncState: "pending",
      commandId: unload.clientOperationId
    });

    const unloads = await listTransportUnloadResults(
      "org-1",
      "11111111-1111-1111-1111-111111111111"
    );
    expect(unloads[0]).toMatchObject({
      tripId: trip.payload.id,
      quantityKg: 9800,
      syncState: "pending"
    });
  });
});
