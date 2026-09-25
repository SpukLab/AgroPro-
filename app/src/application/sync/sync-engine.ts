import type { OutboxRecord } from "../../domain/sync/types";
import {
  getReadyPendingCommands,
  markBlockedPendingCommands,
  markCommandResult,
  markCommandSyncing,
  recoverInterruptedSyncs,
  returnCommandToPending
} from "../../infra/local/outbox";
import type { SyncCommandResult, SyncTransport } from "./protocol";

export interface SyncCycleResult {
  attempted: number;
  accepted: number;
  duplicate: number;
  conflict: number;
  rejected: number;
  pendingExternal: number;
  technicalFailures: number;
  blockedDependencies: number;
}

function emptyResult(): SyncCycleResult {
  return {
    attempted: 0,
    accepted: 0,
    duplicate: 0,
    conflict: 0,
    rejected: 0,
    pendingExternal: 0,
    technicalFailures: 0,
    blockedDependencies: 0
  };
}

function assertMatchingResult(
  command: OutboxRecord,
  result: SyncCommandResult
): void {
  if (result.clientOperationId !== command.clientOperationId) {
    throw new Error(
      `Sync protocol violation: response id ${result.clientOperationId} does not match ${command.clientOperationId}`
    );
  }
}

export async function recoverSyncAfterStartup(): Promise<number> {
  return recoverInterruptedSyncs();
}

export async function syncReadyCommands(
  transport: SyncTransport,
  limit = 25
): Promise<SyncCycleResult> {
  const summary = emptyResult();

  summary.blockedDependencies += await markBlockedPendingCommands();

  const commands = await getReadyPendingCommands(limit);

  for (const command of commands) {
    summary.attempted += 1;
    await markCommandSyncing(command.clientOperationId);

    try {
      const result = await transport.send(command);
      assertMatchingResult(command, result);

      await markCommandResult(command.clientOperationId, result.status, {
        serverRevision: result.serverRevision,
        error: result.message ?? result.errorCode,
        processedAt: result.processedAt
      });

      switch (result.status) {
        case "accepted":
          summary.accepted += 1;
          break;
        case "duplicate":
          summary.duplicate += 1;
          break;
        case "conflict":
          summary.conflict += 1;
          break;
        case "rejected":
          summary.rejected += 1;
          break;
        case "pending_external":
          summary.pendingExternal += 1;
          break;
        case "blocked_dependency":
          summary.blockedDependencies += 1;
          break;
      }
    } catch (error) {
      summary.technicalFailures += 1;
      const message = error instanceof Error ? error.message : "Unknown sync transport error";
      await returnCommandToPending(command.clientOperationId, message);
    }
  }

  summary.blockedDependencies += await markBlockedPendingCommands();
  return summary;
}
