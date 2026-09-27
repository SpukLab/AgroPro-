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
  const attemptedThisCycle = new Set<string>();

  summary.blockedDependencies += await markBlockedPendingCommands();

  while (summary.attempted < limit) {
    const ready = await getReadyPendingCommands(limit - summary.attempted);
    const commands = ready.filter(
      (command) => !attemptedThisCycle.has(command.clientOperationId)
    );

    if (commands.length === 0) break;

    for (const command of commands) {
      attemptedThisCycle.add(command.clientOperationId);
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
        const message =
          error instanceof Error ? error.message : "Unknown sync transport error";
        await returnCommandToPending(command.clientOperationId, message);
      }

      if (summary.attempted >= limit) break;
    }

    summary.blockedDependencies += await markBlockedPendingCommands();
  }

  return summary;
}
