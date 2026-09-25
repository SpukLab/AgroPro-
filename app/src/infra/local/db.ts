import Dexie, { type EntityTable } from "dexie";
import type { OutboxRecord } from "../../domain/sync/types";

export interface EntityCacheRecord {
  key: string;
  entityType: string;
  entityId: string;
  revision: number;
  payload: unknown;
  updatedAt: string;
}

export interface EvidenceQueueRecord {
  id: string;
  subjectRef: string;
  mimeType: string;
  capturedAt: string;
  blob: Blob;
  status: "local" | "queued" | "uploading" | "uploaded" | "failed";
  lastError?: string;
}

export class SurkaraLocalDatabase extends Dexie {
  outbox!: EntityTable<OutboxRecord, "clientOperationId">;
  entityCache!: EntityTable<EntityCacheRecord, "key">;
  evidenceQueue!: EntityTable<EvidenceQueueRecord, "id">;

  constructor(name = "surkara-local") {
    super(name);

    this.version(1).stores({
      outbox:
        "&clientOperationId, status, queuedAtLocal, commandType, tenantScope, targetRef, *dependencies",
      entityCache: "&key, entityType, entityId, updatedAt",
      evidenceQueue: "&id, subjectRef, status, capturedAt"
    });
  }
}

export const surkaraDb = new SurkaraLocalDatabase();
