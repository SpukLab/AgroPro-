import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authoritativeWritePattern =
  /\.from\s*\([^)]*\)\s*\.\s*(insert|update|delete|upsert)\s*\(/m;

describe("architecture boundary", () => {
  it("keeps authoritative Supabase table writes out of the browser adapter", async () => {
    const files = [
      "src/infra/supabase/client.ts",
      "src/infra/supabase/sync-transport.ts"
    ];

    const sources = await Promise.all(
      files.map((file) => readFile(resolve(process.cwd(), file), "utf8"))
    );

    for (const source of sources) {
      expect(source).not.toMatch(authoritativeWritePattern);
    }
  });
});
