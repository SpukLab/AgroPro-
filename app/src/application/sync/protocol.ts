import type { OfflineCommand, OutboxStatus } from "../../domain/sync/types";

export type TerminalSyncStatus = Exclude<OutboxStatus, "pending" | "syncing">;

export interface SyncCommandResult {
  clientOperationId: string;
  status: TerminalSyncStatus;
  serverRevision?: number;
  processedAt: string;
  authoritativeRef?: string;
  errorCode?: string;
  message?: string;
}

export interface SyncTransport {
  send(command: OfflineCommand): Promise<SyncCommandResult>;
}
