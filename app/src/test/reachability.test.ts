import { afterEach, describe, expect, it, vi } from "vitest";
import { probeSyncGateway } from "../infra/network/reachability";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("probeSyncGateway", () => {
  it("reports backend reachability only after a real gateway response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      probeSyncGateway(1000, "https://example.supabase.co")
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/sync-command",
      expect.objectContaining({ method: "OPTIONS", cache: "no-store" })
    );
  });

  it("reports offline when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(
      probeSyncGateway(1000, "https://example.supabase.co")
    ).resolves.toBe(false);
  });
});
