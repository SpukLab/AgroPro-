import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  queueTransportLoad,
  queueTransportVehicle
} from "../application/transport/load-service";
import { clearLocalDataForTests } from "../infra/local/outbox";
import { surkaraDb } from "../infra/local/db";

beforeEach(async () => {
  await clearLocalDataForTests();
});

describe("transport load service", () => {
  it("chains vehicle + grain batch before an offline transport load", async () => {
    const vehicle = await queueTransportVehicle({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      displayName: "Camión 12",
      plate: "AA123BB"
    });

    const load = await queueTransportLoad({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      agriculturalOperationId: "22222222-2222-2222-2222-222222222222",
      sourceEquipmentId: "grain-cart-1",
      vehicleId: vehicle.payload.id,
      quantityValue: 28.5,
      quantityUnit: "t",
      provenance: "estimated",
      loadedAt: "2026-09-28T16:30:00-03:00"
    });

    const commands = await surkaraDb.outbox.toArray();
    const batch = commands.find(
      (item) => item.commandType === "harvest.create_grain_batch"
    );
    const storedVehicle = commands.find(
      (item) => item.commandType === "transport.create_vehicle"
    );
    const storedLoad = commands.find(
      (item) => item.clientOperationId === load.clientOperationId
    );

    expect(storedVehicle?.payload).toMatchObject({
      vehicleKind: "truck",
      displayName: "Camión 12",
      plate: "AA123BB"
    });

    expect(storedLoad?.commandType).toBe("transport.create_load");
    expect(storedLoad?.dependencies).toEqual(
      expect.arrayContaining([
        batch?.clientOperationId,
        storedVehicle?.clientOperationId
      ])
    );
    expect(storedLoad?.payload).toMatchObject({
      grainBatchId: "11111111-1111-1111-1111-111111111111",
      sourceWorkSessionId: "11111111-1111-1111-1111-111111111111",
      sourceEquipmentId: "grain-cart-1",
      vehicleId: vehicle.payload.id,
      quantityKg: 28500,
      status: "loaded"
    });
  });
});
