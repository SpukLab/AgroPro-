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
import { clearLocalDataForTests } from "../infra/local/outbox";
import { surkaraDb } from "../infra/local/db";

beforeEach(async () => {
  await clearLocalDataForTests();
});

describe("transport lifecycle service", () => {
  it("chains create -> depart -> arrive -> unloading offline", async () => {
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

    const departure = await queueDepartTransportTrip({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      tripId: trip.payload.id,
      departedAt: "2026-09-30T09:35:00-03:00"
    });

    const arrival = await queueArriveTransportTrip({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      tripId: trip.payload.id,
      arrivedAt: "2026-09-30T10:35:00-03:00"
    });

    const unloading = await queueStartUnloadingTransportTrip({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      tripId: trip.payload.id,
      unloadingStartedAt: "2026-09-30T10:50:00-03:00"
    });

    const commands = await surkaraDb.outbox.toArray();
    const departStored = commands.find(
      (item) => item.clientOperationId === departure.clientOperationId
    );
    const arriveStored = commands.find(
      (item) => item.clientOperationId === arrival.clientOperationId
    );
    const unloadStored = commands.find(
      (item) => item.clientOperationId === unloading.clientOperationId
    );

    expect(departStored?.dependencies).toEqual([trip.clientOperationId]);
    expect(arriveStored?.dependencies).toEqual([departure.clientOperationId]);
    expect(unloadStored?.dependencies).toEqual([arrival.clientOperationId]);

    const trips = await listTransportTrips(
      "org-1",
      "11111111-1111-1111-1111-111111111111"
    );

    expect(trips[0]).toMatchObject({
      id: trip.payload.id,
      status: "unloading",
      revision: 4,
      unloadingStartedAt: "2026-09-30T10:50:00-03:00",
      syncState: "pending",
      commandId: unloading.clientOperationId
    });
  });
});
