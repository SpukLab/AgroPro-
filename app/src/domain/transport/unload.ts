export type TransportUnloadUnit = "kg" | "t";
export type TransportUnloadProvenance = "scale" | "ticket" | "manual";

export interface TransportUnloadResult {
  id: string;
  tripId: string;
  loadId: string;
  destinationLabel: string;
  quantityValue: number;
  quantityUnit: TransportUnloadUnit;
  quantityKg: number;
  provenance: TransportUnloadProvenance;
  unloadedAt: string;
  moisturePercent?: number;
  ticketRef?: string;
  note?: string;
  status: "delivered";
}

function validTimestamp(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

export function createTransportUnloadResult(input: {
  id?: string;
  tripId: string;
  loadId: string;
  destinationLabel: string;
  quantityValue: number;
  quantityUnit: TransportUnloadUnit;
  provenance?: TransportUnloadProvenance;
  unloadedAt: string;
  moisturePercent?: number;
  ticketRef?: string;
  note?: string;
}): TransportUnloadResult {
  const destinationLabel = input.destinationLabel.trim();
  const ticketRef = input.ticketRef?.trim();
  const note = input.note?.trim();

  if (!input.tripId.trim()) throw new Error("tripId is required");
  if (!input.loadId.trim()) throw new Error("loadId is required");
  if (!destinationLabel) throw new Error("destinationLabel is required");
  if (destinationLabel.length > 160) {
    throw new Error("destinationLabel is too long");
  }
  if (!Number.isFinite(input.quantityValue) || input.quantityValue <= 0) {
    throw new Error("quantityValue must be greater than 0");
  }
  if (!validTimestamp(input.unloadedAt)) {
    throw new Error("unloadedAt must be a valid timestamp");
  }
  if (
    input.moisturePercent !== undefined &&
    (!Number.isFinite(input.moisturePercent) ||
      input.moisturePercent < 0 ||
      input.moisturePercent > 100)
  ) {
    throw new Error("moisturePercent must be between 0 and 100");
  }
  if (ticketRef && ticketRef.length > 80) {
    throw new Error("ticketRef is too long");
  }
  if (note && note.length > 240) throw new Error("note is too long");

  return {
    id: input.id ?? crypto.randomUUID(),
    tripId: input.tripId,
    loadId: input.loadId,
    destinationLabel,
    quantityValue: input.quantityValue,
    quantityUnit: input.quantityUnit,
    quantityKg:
      input.quantityUnit === "t"
        ? input.quantityValue * 1000
        : input.quantityValue,
    provenance: input.provenance ?? "scale",
    unloadedAt: input.unloadedAt,
    moisturePercent: input.moisturePercent,
    ticketRef: ticketRef || undefined,
    note: note || undefined,
    status: "delivered"
  };
}
