export type HarvestMeasurementKind =
  | "area_completed_ha"
  | "machine_hours"
  | "fuel_liters";

export type MeasurementProvenance =
  | "manual"
  | "machine"
  | "estimated"
  | "calculated";

export interface HarvestMeasurement {
  id: string;
  workSessionId: string;
  equipmentId?: string;
  kind: HarvestMeasurementKind;
  value: number;
  unit: "ha" | "h" | "l";
  provenance: MeasurementProvenance;
  observedAt: string;
  note?: string;
}

export type DowntimeCause =
  | "waiting_resource"
  | "breakdown"
  | "weather"
  | "logistics"
  | "maintenance"
  | "other";

export interface HarvestDowntimeEvent {
  id: string;
  workSessionId: string;
  blockingEquipmentId?: string;
  cause: DowntimeCause;
  startedAt: string;
  endedAt: string;
  provenance: MeasurementProvenance;
  note?: string;
}

const units: Record<HarvestMeasurementKind, HarvestMeasurement["unit"]> = {
  area_completed_ha: "ha",
  machine_hours: "h",
  fuel_liters: "l"
};

function validTimestamp(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

export function createHarvestMeasurement(input: {
  id?: string;
  workSessionId: string;
  equipmentId?: string;
  kind: HarvestMeasurementKind;
  value: number;
  provenance?: MeasurementProvenance;
  observedAt: string;
  note?: string;
}): HarvestMeasurement {
  if (!input.workSessionId.trim()) {
    throw new Error("workSessionId is required");
  }

  if (!Number.isFinite(input.value) || input.value <= 0) {
    throw new Error("value must be greater than 0");
  }

  if (!validTimestamp(input.observedAt)) {
    throw new Error("observedAt must be a valid timestamp");
  }

  if (
    (input.kind === "machine_hours" || input.kind === "fuel_liters") &&
    !input.equipmentId?.trim()
  ) {
    throw new Error("equipmentId is required for equipment measurements");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    workSessionId: input.workSessionId,
    equipmentId: input.equipmentId?.trim() || undefined,
    kind: input.kind,
    value: input.value,
    unit: units[input.kind],
    provenance: input.provenance ?? "manual",
    observedAt: input.observedAt,
    note: input.note?.trim() || undefined
  };
}

export function createHarvestDowntimeEvent(input: {
  id?: string;
  workSessionId: string;
  blockingEquipmentId?: string;
  cause: DowntimeCause;
  startedAt: string;
  endedAt: string;
  provenance?: MeasurementProvenance;
  note?: string;
}): HarvestDowntimeEvent {
  if (!input.workSessionId.trim()) {
    throw new Error("workSessionId is required");
  }

  const start = new Date(input.startedAt).getTime();
  const end = new Date(input.endedAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("endedAt must not be before startedAt");
  }

  if (input.cause === "waiting_resource" && !input.blockingEquipmentId?.trim()) {
    throw new Error("blockingEquipmentId is required when waiting for a resource");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    workSessionId: input.workSessionId,
    blockingEquipmentId: input.blockingEquipmentId?.trim() || undefined,
    cause: input.cause,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    provenance: input.provenance ?? "manual",
    note: input.note?.trim() || undefined
  };
}
