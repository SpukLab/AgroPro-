import { describe, expect, it } from "vitest";
import {
  createHarvestDowntimeEvent,
  createHarvestMeasurement
} from "../domain/harvest/session-record";

describe("harvest session field records", () => {
  it("creates an area measurement without equipment", () => {
    expect(
      createHarvestMeasurement({
        id: "measurement-1",
        workSessionId: "session-1",
        kind: "area_completed_ha",
        value: 24.5,
        observedAt: "2026-09-27T15:00:00-03:00"
      })
    ).toMatchObject({
      id: "measurement-1",
      workSessionId: "session-1",
      kind: "area_completed_ha",
      value: 24.5,
      unit: "ha",
      provenance: "manual"
    });
  });

  it("requires equipment for machine hours and fuel", () => {
    expect(() =>
      createHarvestMeasurement({
        workSessionId: "session-1",
        kind: "machine_hours",
        value: 2.5,
        observedAt: "2026-09-27T15:00:00-03:00"
      })
    ).toThrow(/equipmentId/);
  });

  it("requires a blocking resource for waiting downtime", () => {
    expect(() =>
      createHarvestDowntimeEvent({
        workSessionId: "session-1",
        cause: "waiting_resource",
        startedAt: "2026-09-27T15:00:00-03:00",
        endedAt: "2026-09-27T15:20:00-03:00"
      })
    ).toThrow(/blockingEquipmentId/);
  });

  it("rejects downtime ending before it starts", () => {
    expect(() =>
      createHarvestDowntimeEvent({
        workSessionId: "session-1",
        cause: "weather",
        startedAt: "2026-09-27T15:20:00-03:00",
        endedAt: "2026-09-27T15:00:00-03:00"
      })
    ).toThrow(/endedAt/);
  });
});
