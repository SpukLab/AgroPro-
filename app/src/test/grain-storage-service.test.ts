import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  queueGrainStorageReceipt,
  queueGrainStorageUnit
} from "../application/storage/grain-storage-service";
import { clearLocalDataForTests } from "../infra/local/outbox";
import { surkaraDb } from "../infra/local/db";

beforeEach(async () => {
  await clearLocalDataForTests();
});

describe("grain storage service", () => {
  it("chains storage unit + grain batch before an offline receipt", async () => {
    const unit = await queueGrainStorageUnit({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      storageKind: "silo",
      displayName: "Silo campo"
    });

    const receipt = await queueGrainStorageReceipt({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      agriculturalOperationId: "22222222-2222-2222-2222-222222222222",
      sourceEquipmentId: "grain-cart-1",
      storageUnitId: unit.payload.id,
      quantityValue: 20,
      quantityUnit: "t",
      provenance: "estimated",
      receivedAt: "2026-09-28T16:45:00-03:00"
    });

    const commands = await surkaraDb.outbox.toArray();
    const batch = commands.find(
      (item) => item.commandType === "harvest.create_grain_batch"
    );
    const storedUnit = commands.find(
      (item) => item.commandType === "storage.create_unit"
    );
    const storedReceipt = commands.find(
      (item) => item.clientOperationId === receipt.clientOperationId
    );

    expect(storedUnit?.payload).toMatchObject({
      storageKind: "silo",
      displayName: "Silo campo"
    });

    expect(storedReceipt?.commandType).toBe(
      "storage.record_grain_receipt"
    );
    expect(storedReceipt?.dependencies).toEqual(
      expect.arrayContaining([
        batch?.clientOperationId,
        storedUnit?.clientOperationId
      ])
    );
    expect(storedReceipt?.payload).toMatchObject({
      grainBatchId: "11111111-1111-1111-1111-111111111111",
      sourceWorkSessionId: "11111111-1111-1111-1111-111111111111",
      sourceEquipmentId: "grain-cart-1",
      storageUnitId: unit.payload.id,
      quantityKg: 20000,
      status: "stored"
    });
  });
});
