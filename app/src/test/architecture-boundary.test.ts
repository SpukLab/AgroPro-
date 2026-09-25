import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authoritativeWritePattern =
  /\.from\s*\([^)]*\)\s*\.\s*(insert|update|delete|upsert)\s*\(/m;

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(path)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}

describe("architecture boundary", () => {
  it("keeps authoritative Supabase table writes out of every browser adapter", async () => {
    const directory = resolve(process.cwd(), "src/infra/supabase");
    const files = await collectTypeScriptFiles(directory);

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, `direct authoritative write found in ${file}`).not.toMatch(
        authoritativeWritePattern
      );
    }
  });
});
