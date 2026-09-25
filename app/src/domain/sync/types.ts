export type ConflictClass = "A" | "B" | "C" | "D" | "E";

export type OutboxStatus =
  | "pending"
  | "syncing"
  | "accepted"
  | "duplicate"
  | "conflict"
  | "rejected"
  | "blocked_dependency"
  | "pending_external";

export interface OfflineCommand<TPayload = unknown> {
  clientOperationId: string;
  actorId: string;
  deviceId: string;
  tenantScope: string;
  commandType: string;
  targetRef?: string;
  baseRevision?: number;
  occurredAtLocal: string;
  queuedAtLocal: string;
  payload: TPayload;
  conflictClass: ConflictClass;
  dependencies: string[];
  evidenceRefs: string[];
  schemaVersion: 1;
}

export interface OutboxRecord<TPayload = unknown> extends OfflineCommand<TPayload> {
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  serverRevision?: number;
  processedAt?: string;
}
