import { describe, expect, it } from "vitest";
import {
  createArriveTransportTripPayload,
  createDepartTransportTripPayload,
  createStartUnloadingTransportTripPayload
} from "../domain/transport/trip";

describe("transport trip lifecycle domain", () => {
  it("creates departure payload with optimistic revision", () => {
    expect(
      createDepartTransportTripPayload({
        tripId: "trip-1",
        expectedRevision: 1,
        departedAt: "2026-09-30T10:00:00-03:00"
      })
    ).toEqual({
      tripId: "trip-1",
      expectedRevision: 1,
      departedAt: "2026-09-30T10:00:00-03:00"
    });
  });

  it("creates arrival with stable waiting-time identity", () => {
    expect(
      createArriveTransportTripPayload({
        waitingTimeId: "wait-1",
        tripId: "trip-1",
        expectedRevision: 2,
        arrivedAt: "2026-09-30T11:00:00-03:00"
      })
    ).toEqual({
      waitingTimeId: "wait-1",
      tripId: "trip-1",
      expectedRevision: 2,
      arrivedAt: "2026-09-30T11:00:00-03:00",
      cause: "destination_queue",
      note: undefined
    });
  });

  it("requires the active waiting identity before unloading", () => {
    expect(() =>
      createStartUnloadingTransportTripPayload({
        tripId: "trip-1",
        waitingTimeId: "",
        expectedRevision: 3,
        unloadingStartedAt: "2026-09-30T11:30:00-03:00"
      })
    ).toThrow(/waitingTimeId is required/);
  });
});
