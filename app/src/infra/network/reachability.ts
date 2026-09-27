import { supabaseUrl } from "../supabase/client";

export type BackendReachability = "checking" | "online" | "offline";

export async function probeSyncGateway(
  timeoutMs = 3500,
  baseUrl = supabaseUrl
): Promise<boolean> {
  if (!baseUrl) return false;

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/functions/v1/sync-command`, {
      method: "OPTIONS",
      cache: "no-store",
      signal: controller.signal
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
