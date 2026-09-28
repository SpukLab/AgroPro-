import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  queueHarvestDowntime,
  queueHarvestMeasurement
} from "../application/harvest/session-record-service";
import { clearLocalDataForTests } from "../infra/local/outbox";
import { surkaraDb } from "../infra/local/db";

beforeEach(async () => {
  await clearLocalDataForTests();
});

describe("harvest session record service", () => {
  it("queues append-only area measurement", async () => {
    const command = await queueHarvestMeasurement({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "session-1",
      kind: "area_completed_ha",
      value: 12.75,
      observedAt: "2026-09-27T15:00:00-03:00"
    });

    const stored = await surkaraDb.outbox.get(command.clientOperationId);

    expect(stored?.commandType).toBe("harvest.record_measurement");
    expect(stored?.conflictClass).toBe("A");
    expect(stored?.payload).toMatchObject({
      workSessionId: "session-1",
      kind: "area_completed_ha",
      value: 12.75,
      unit: "ha"
    });
  });

  it("queues downtime with blocking equipment", async () => {
    const command = await queueHarvestDowntime({
      actorId: "actor-1",
      organizationId: "org-1",
      deviceId: "device-1",
      workSessionId: "session-1",
      blockingEquipmentId: "equipment-1",
      cause: "waiting_resource",
      startedAt: "2026-09-27T15:00:00-03:00",
      endedAt: "2026-09-27T15:20:00-03:00",
      note: "Esperando monotolva"
    });

    const stored = await surkaraDb.outbox.get(command.clientOperationId);

    expect(stored?.commandType).toBe("harvest.record_downtime");
    expect(stored?.payload).toMatchObject({
      workSessionId: "session-1",
      blockingEquipmentId: "equipment-1",
      cause: "waiting_resource"
    });
  });
});
