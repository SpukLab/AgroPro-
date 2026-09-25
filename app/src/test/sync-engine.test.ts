import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { OfflineCommand } from "../domain/sync/types";
import type { SyncTransport } from "../application/sync/protocol";
import {
  recoverSyncAfterStartup,
  syncReadyCommands
} from "../application/sync/sync-engine";
import { surkaraDb } from "../infra/local/db";
import {
  clearLocalDataForTests,
  enqueueCommand,
  markCommandSyncing
} from "../infra/local/outbox";

function command(id: string, dependencies: string[] = []): OfflineCommand {
  return {
    clientOperationId: id,
    actorId: "actor-1",
    deviceId: "device-1",
    tenantScope: "org-1",
    commandType: "test.command",
    targetRef: `target-${id}`,
    occurredAtLocal: "2026-09-24T22:00:00-03:00",
    queuedAtLocal: "2026-09-24T22:00:00-03:00",
    payload: { id },
    conflictClass: "C",
    dependencies,
    evidenceRefs: [],
    schemaVersion: 1
  };
}

beforeEach(async () => {
  await clearLocalDataForTests();
});

describe("sync engine", () => {
  it("persists an accepted gateway result and server revision", async () => {
    await enqueueCommand(command("cmd-accepted"));

    const transport: SyncTransport = {
      async send(input) {
        return {
          clientOperationId: input.clientOperationId,
          status: "accepted",
          serverRevision: 1,
          processedAt: "2026-09-25T01:00:00Z"
        };
      }
    };

    const result = await syncReadyCommands(transport);
    const stored = await surkaraDb.outbox.get("cmd-accepted");

    expect(result.accepted).toBe(1);
    expect(stored?.status).toBe("accepted");
    expect(stored?.serverRevision).toBe(1);
    expect(stored?.attempts).toBe(1);
  });

  it("returns a command to pending after a technical transport failure", async () => {
    await enqueueCommand(command("cmd-network"));

    const transport: SyncTransport = {
      async send() {
        throw new Error("network unavailable");
      }
    };

    const result = await syncReadyCommands(transport);
    const stored = await surkaraDb.outbox.get("cmd-network");

    expect(result.technicalFailures).toBe(1);
    expect(stored?.status).toBe("pending");
    expect(stored?.attempts).toBe(1);
    expect(stored?.lastError).toMatch(/network unavailable/);
  });

  it("treats a mismatched gateway response as retryable protocol failure", async () => {
    await enqueueCommand(command("cmd-a"));

    const transport: SyncTransport = {
      async send() {
        return {
          clientOperationId: "different-id",
          status: "accepted",
          processedAt: "2026-09-25T01:00:00Z"
        };
      }
    };

    const result = await syncReadyCommands(transport);
    const stored = await surkaraDb.outbox.get("cmd-a");

    expect(result.technicalFailures).toBe(1);
    expect(stored?.status).toBe("pending");
    expect(stored?.lastError).toMatch(/protocol violation/);
  });

  it("blocks dependent commands when their dependency is rejected", async () => {
    await enqueueCommand(command("parent"));
    await enqueueCommand(command("child", ["parent"]));

    const transport: SyncTransport = {
      async send(input) {
        return {
          clientOperationId: input.clientOperationId,
          status: "rejected",
          processedAt: "2026-09-25T01:00:00Z",
          errorCode: "invalid_command"
        };
      }
    };

    const result = await syncReadyCommands(transport);
    const parent = await surkaraDb.outbox.get("parent");
    const child = await surkaraDb.outbox.get("child");

    expect(result.rejected).toBe(1);
    expect(result.blockedDependencies).toBe(1);
    expect(parent?.status).toBe("rejected");
    expect(child?.status).toBe("blocked_dependency");
  });

  it("recovers commands left syncing after an interrupted app session", async () => {
    await enqueueCommand(command("cmd-interrupted"));
    await markCommandSyncing("cmd-interrupted");

    expect((await surkaraDb.outbox.get("cmd-interrupted"))?.status).toBe("syncing");

    const recovered = await recoverSyncAfterStartup();
    const stored = await surkaraDb.outbox.get("cmd-interrupted");

    expect(recovered).toBe(1);
    expect(stored?.status).toBe("pending");
    expect(stored?.lastError).toMatch(/Recovered/);
  });
});
