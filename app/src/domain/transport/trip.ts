export type TransportTripStatus =
  | "loaded"
  | "departed"
  | "waiting"
  | "unloading"
  | "delivered"
  | "closed"
  | "cancelled";

export interface TransportDriver {
  id: string;
  displayName: string;
  licenseRef?: string;
  status: "active";
}

export interface TransportTrip {
  id: string;
  loadId: string;
  sourceWorkSessionId: string;
  vehicleId: string;
  driverId: string;
  originLabel: string;
  destinationLabel: string;
  plannedDepartureAt: string;
  status: "loaded";
  revision: 1;
}

function validTimestamp(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

export function createTransportDriver(input: {
  id?: string;
  displayName: string;
  licenseRef?: string;
}): TransportDriver {
  const displayName = input.displayName.trim();
  const licenseRef = input.licenseRef?.trim();

  if (!displayName) throw new Error("displayName is required");
  if (displayName.length > 120) throw new Error("displayName is too long");
  if (licenseRef && licenseRef.length > 40) {
    throw new Error("licenseRef is too long");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    displayName,
    licenseRef: licenseRef || undefined,
    status: "active"
  };
}

export function createTransportTrip(input: {
  id?: string;
  loadId: string;
  sourceWorkSessionId: string;
  vehicleId: string;
  driverId: string;
  originLabel: string;
  destinationLabel: string;
  plannedDepartureAt: string;
}): TransportTrip {
  const originLabel = input.originLabel.trim();
  const destinationLabel = input.destinationLabel.trim();

  if (!input.loadId.trim()) throw new Error("loadId is required");
  if (!input.sourceWorkSessionId.trim()) {
    throw new Error("sourceWorkSessionId is required");
  }
  if (!input.vehicleId.trim()) throw new Error("vehicleId is required");
  if (!input.driverId.trim()) throw new Error("driverId is required");
  if (!originLabel) throw new Error("originLabel is required");
  if (!destinationLabel) throw new Error("destinationLabel is required");
  if (originLabel.length > 160) throw new Error("originLabel is too long");
  if (destinationLabel.length > 160) {
    throw new Error("destinationLabel is too long");
  }
  if (!validTimestamp(input.plannedDepartureAt)) {
    throw new Error("plannedDepartureAt must be a valid timestamp");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    loadId: input.loadId,
    sourceWorkSessionId: input.sourceWorkSessionId,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    originLabel,
    destinationLabel,
    plannedDepartureAt: input.plannedDepartureAt,
    status: "loaded",
    revision: 1
  };
}
