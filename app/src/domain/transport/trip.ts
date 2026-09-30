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


export type TransportWaitingCause =
  | "destination_queue"
  | "destination_closed"
  | "documentation"
  | "scale_queue"
  | "other";

export interface DepartTransportTripPayload {
  tripId: string;
  expectedRevision: number;
  departedAt: string;
}

export interface ArriveTransportTripPayload {
  waitingTimeId: string;
  tripId: string;
  expectedRevision: number;
  arrivedAt: string;
  cause: TransportWaitingCause;
  note?: string;
}

export interface StartUnloadingTransportTripPayload {
  tripId: string;
  waitingTimeId: string;
  expectedRevision: number;
  unloadingStartedAt: string;
}

function positiveRevision(value: number) {
  return Number.isInteger(value) && value > 0;
}

export function createDepartTransportTripPayload(input: {
  tripId: string;
  expectedRevision: number;
  departedAt: string;
}): DepartTransportTripPayload {
  if (!input.tripId.trim()) throw new Error("tripId is required");
  if (!positiveRevision(input.expectedRevision)) {
    throw new Error("expectedRevision must be positive");
  }
  if (!validTimestamp(input.departedAt)) {
    throw new Error("departedAt must be a valid timestamp");
  }

  return { ...input };
}

export function createArriveTransportTripPayload(input: {
  waitingTimeId?: string;
  tripId: string;
  expectedRevision: number;
  arrivedAt: string;
  cause?: TransportWaitingCause;
  note?: string;
}): ArriveTransportTripPayload {
  if (!input.tripId.trim()) throw new Error("tripId is required");
  if (!positiveRevision(input.expectedRevision)) {
    throw new Error("expectedRevision must be positive");
  }
  if (!validTimestamp(input.arrivedAt)) {
    throw new Error("arrivedAt must be a valid timestamp");
  }

  const note = input.note?.trim();
  if (note && note.length > 240) throw new Error("note is too long");

  return {
    waitingTimeId: input.waitingTimeId ?? crypto.randomUUID(),
    tripId: input.tripId,
    expectedRevision: input.expectedRevision,
    arrivedAt: input.arrivedAt,
    cause: input.cause ?? "destination_queue",
    note: note || undefined
  };
}

export function createStartUnloadingTransportTripPayload(input: {
  tripId: string;
  waitingTimeId: string;
  expectedRevision: number;
  unloadingStartedAt: string;
}): StartUnloadingTransportTripPayload {
  if (!input.tripId.trim()) throw new Error("tripId is required");
  if (!input.waitingTimeId.trim()) {
    throw new Error("waitingTimeId is required");
  }
  if (!positiveRevision(input.expectedRevision)) {
    throw new Error("expectedRevision must be positive");
  }
  if (!validTimestamp(input.unloadingStartedAt)) {
    throw new Error("unloadingStartedAt must be a valid timestamp");
  }

  return { ...input };
}
