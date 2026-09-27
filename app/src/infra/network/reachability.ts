import { supabaseUrl } from "../supabase/client";

export type BackendReachability = "checking" | "online" | "offline";

export async function probeSyncGateway(timeoutMs = 3500): Promise<boolean> {
  if (!supabaseUrl) return false;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-command`, {
      method: "OPTIONS",
      cache: "no-store",
      signal: controller.signal
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
