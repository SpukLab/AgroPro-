import { surkaraDb } from "./db";
import type { OfflineCommand, OutboxRecord, OutboxStatus } from "../../domain/sync/types";

const completedDependencyStatuses = new Set<OutboxStatus>(["accepted", "duplicate"]);
const failedDependencyStatuses = new Set<OutboxStatus>([
  "conflict",
  "rejected",
  "blocked_dependency"
]);

function invariantFingerprint(command: OfflineCommand): string {
  return JSON.stringify({
    actorId: command.actorId,
    deviceId: command.deviceId,
    tenantScope: command.tenantScope,
    commandType: command.commandType,
    targetRef: command.targetRef,
    baseRevision: command.baseRevision,
    occurredAtLocal: command.occurredAtLocal,
    payload: command.payload,
    conflictClass: command.conflictClass,
    dependencies: command.dependencies,
    evidenceRefs: command.evidenceRefs,
    schemaVersion: command.schemaVersion
  });
}

export async function enqueueCommand<TPayload>(
  command: OfflineCommand<TPayload>
): Promise<OutboxRecord<TPayload>> {
  const existing = await surkaraDb.outbox.get(command.clientOperationId);

  if (existing) {
    if (invariantFingerprint(existing) !== invariantFingerprint(command)) {
      throw new Error(
        `clientOperationId collision with different command: ${command.clientOperationId}`
      );
    }

    return existing as OutboxRecord<TPayload>;
  }

  const record: OutboxRecord<TPayload> = {
    ...command,
    status: "pending",
    attempts: 0
  };

  await surkaraDb.outbox.add(record as OutboxRecord);
  return record;
}

export async function getReadyPendingCommands(limit = 50): Promise<OutboxRecord[]> {
  const pending = await surkaraDb.outbox.where("status").equals("pending").sortBy("queuedAtLocal");
  const ready: OutboxRecord[] = [];

  for (const command of pending) {
    if (ready.length >= limit) break;

    if (command.dependencies.length === 0) {
      ready.push(command);
      continue;
    }

    const dependencies = await surkaraDb.outbox.bulkGet(command.dependencies);
    const allSatisfied = dependencies.every(
      (dependency) =>
        dependency !== undefined && completedDependencyStatuses.has(dependency.status)
    );

    if (allSatisfied) ready.push(command);
  }

  return ready;
}

export async function recoverInterruptedSyncs(): Promise<number> {
  const interrupted = await surkaraDb.outbox.where("status").equals("syncing").toArray();

  if (interrupted.length === 0) return 0;

  await surkaraDb.transaction("rw", surkaraDb.outbox, async () => {
    for (const command of interrupted) {
      await surkaraDb.outbox.update(command.clientOperationId, {
        status: "pending",
        lastError: "Recovered after interrupted sync"
      });
    }
  });

  return interrupted.length;
}

export async function markBlockedPendingCommands(): Promise<number> {
  const pending = await surkaraDb.outbox.where("status").equals("pending").toArray();
  let blocked = 0;

  await surkaraDb.transaction("rw", surkaraDb.outbox, async () => {
    for (const command of pending) {
      if (command.dependencies.length === 0) continue;

      const dependencies = await surkaraDb.outbox.bulkGet(command.dependencies);
      const failedDependency = dependencies.find(
        (dependency) =>
          dependency !== undefined && failedDependencyStatuses.has(dependency.status)
      );

      if (!failedDependency) continue;

      await surkaraDb.outbox.update(command.clientOperationId, {
        status: "blocked_dependency",
        lastError: `Dependency ${failedDependency.clientOperationId} ended as ${failedDependency.status}`,
        processedAt: new Date().toISOString()
      });
      blocked += 1;
    }
  });

  return blocked;
}

export async function markCommandSyncing(clientOperationId: string): Promise<void> {
  await surkaraDb.transaction("rw", surkaraDb.outbox, async () => {
    const command = await surkaraDb.outbox.get(clientOperationId);
    if (!command) throw new Error(`Unknown command: ${clientOperationId}`);

    await surkaraDb.outbox.update(clientOperationId, {
      status: "syncing",
      attempts: command.attempts + 1,
      lastError: undefined
    });
  });
}

export async function markCommandResult(
  clientOperationId: string,
  status: Exclude<OutboxStatus, "pending" | "syncing">,
  options?: { serverRevision?: number; error?: string; processedAt?: string }
): Promise<void> {
  const updated = await surkaraDb.outbox.update(clientOperationId, {
    status,
    serverRevision: options?.serverRevision,
    lastError: options?.error,
    processedAt: options?.processedAt ?? new Date().toISOString()
  });

  if (updated !== 1) throw new Error(`Unknown command: ${clientOperationId}`);
}

export async function returnCommandToPending(
  clientOperationId: string,
  error: string
): Promise<void> {
  const updated = await surkaraDb.outbox.update(clientOperationId, {
    status: "pending",
    lastError: error
  });

  if (updated !== 1) throw new Error(`Unknown command: ${clientOperationId}`);
}

export async function clearLocalDataForTests(): Promise<void> {
  await surkaraDb.transaction(
    "rw",
    surkaraDb.outbox,
    surkaraDb.entityCache,
    surkaraDb.evidenceQueue,
    async () => {
      await Promise.all([
        surkaraDb.outbox.clear(),
        surkaraDb.entityCache.clear(),
        surkaraDb.evidenceQueue.clear()
      ]);
    }
  );
}
