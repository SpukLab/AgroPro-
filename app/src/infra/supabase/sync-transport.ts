import type { OfflineCommand } from "../../domain/sync/types";
import type {
  SyncCommandResult,
  SyncTransport
} from "../../application/sync/protocol";
import { supabase } from "./client";

function isSyncCommandResult(value: unknown): value is SyncCommandResult {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<SyncCommandResult>;
  return (
    typeof candidate.clientOperationId === "string" &&
    typeof candidate.status === "string" &&
    typeof candidate.processedAt === "string"
  );
}

export function createSupabaseSyncTransport(): SyncTransport {
  return {
    async send(command: OfflineCommand): Promise<SyncCommandResult> {
      if (!supabase) {
        throw new Error("Supabase is not configured");
      }

      const { data, error } = await supabase.functions.invoke("sync-command", {
        body: command
      });

      if (error) {
        throw new Error(`Sync Gateway transport error: ${error.message}`);
      }

      if (!isSyncCommandResult(data)) {
        throw new Error("Sync Gateway returned an invalid response");
      }

      return data;
    }
  };
}
