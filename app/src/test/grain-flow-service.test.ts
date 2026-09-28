import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { queueGrainTransfer } from "../application/harvest/grain-flow-service";
import { clearLocalDataForTests } from "../infra/local/outbox";
import { surkaraDb } from "../infra/local/db";

beforeEach(async () => {
  await clearLocalDataForTests();
});

describe("grain flow service", () => {
  it("queues a deterministic batch before the first grain transfer", async () => {
    const transfer = await queueGrainTransfer({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      agriculturalOperationId: "22222222-2222-2222-2222-222222222222",
      sourceEquipmentId: "source-equipment",
      destinationEquipmentId: "destination-equipment",
      quantityValue: 8.5,
      quantityUnit: "t",
      provenance: "estimated",
      occurredAt: "2026-09-27T18:00:00-03:00"
    });

    const commands = await surkaraDb.outbox.toArray();
    const batch = commands.find(
      (item) => item.commandType === "harvest.create_grain_batch"
    );
    const storedTransfer = commands.find(
      (item) => item.clientOperationId === transfer.clientOperationId
    );

    expect(batch?.targetRef).toBe(
      "11111111-1111-1111-1111-111111111111"
    );
    expect(batch?.payload).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      sourceWorkSessionId: "11111111-1111-1111-1111-111111111111",
      batchKey: "session_primary"
    });

    expect(storedTransfer?.commandType).toBe(
      "harvest.record_grain_transfer"
    );
    expect(storedTransfer?.dependencies).toEqual([
      batch?.clientOperationId
    ]);
    expect(storedTransfer?.payload).toMatchObject({
      grainBatchId: "11111111-1111-1111-1111-111111111111",
      quantityValue: 8.5,
      quantityUnit: "t",
      quantityKg: 8500
    });
  });

  it("reuses the locally queued batch for subsequent transfers", async () => {
    const base = {
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "11111111-1111-1111-1111-111111111111",
      agriculturalOperationId: "22222222-2222-2222-2222-222222222222",
      sourceEquipmentId: "source-equipment",
      destinationEquipmentId: "destination-equipment",
      quantityUnit: "kg" as const,
      provenance: "manual" as const,
      occurredAt: "2026-09-27T18:00:00-03:00"
    };

    await queueGrainTransfer({ ...base, quantityValue: 4000 });
    await queueGrainTransfer({ ...base, quantityValue: 3500 });

    const commands = await surkaraDb.outbox.toArray();

    expect(
      commands.filter(
        (item) => item.commandType === "harvest.create_grain_batch"
      )
    ).toHaveLength(1);

    expect(
      commands.filter(
        (item) => item.commandType === "harvest.record_grain_transfer"
      )
    ).toHaveLength(2);
  });
});
