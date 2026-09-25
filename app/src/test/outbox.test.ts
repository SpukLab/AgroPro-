import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { OfflineCommand } from "../domain/sync/types";
import { surkaraDb } from "../infra/local/db";
import {
  clearLocalDataForTests,
  enqueueCommand,
  getReadyPendingCommands,
  markCommandResult
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

describe("offline outbox", () => {
  it("is idempotent for the same client operation id", async () => {
    await enqueueCommand(command("cmd-1"));
    await enqueueCommand(command("cmd-1"));

    expect(await surkaraDb.outbox.count()).toBe(1);
  });

  it("rejects reuse of the same id for different intent", async () => {
    await enqueueCommand(command("cmd-1"));

    await expect(
      enqueueCommand({
        ...command("cmd-1"),
        payload: { id: "different" }
      })
    ).rejects.toThrow(/collision/);
  });

  it("does not release dependent commands before dependencies are accepted", async () => {
    await enqueueCommand(command("parent"));
    await enqueueCommand(command("child", ["parent"]));

    let ready = await getReadyPendingCommands();
    expect(ready.map((item) => item.clientOperationId)).toEqual(["parent"]);

    await markCommandResult("parent", "accepted");

    ready = await getReadyPendingCommands();
    expect(ready.map((item) => item.clientOperationId)).toEqual(["child"]);
  });
});
