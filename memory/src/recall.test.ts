import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { HashEmbeddingBackend, SqliteRecallStore } from "./recall.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("SqliteRecallStore", () => {
  it("returns semantically similar memories using the selected local embedding backend", () => {
    const recall = new SqliteRecallStore(makeDbPath(), new HashEmbeddingBackend(256));
    recall.add({
      id: "pricing",
      text: "The agent charges one cent in USDC through x402 on Base.",
      metadata: { kind: "decision" }
    });
    recall.add({
      id: "styling",
      text: "The page uses compact dark styling for the human-readable landing view.",
      metadata: { kind: "note" }
    });

    const results = recall.query("How much does the x402 Base payment cost?", { limit: 1 });

    expect(results[0]?.id).toBe("pricing");
    expect(results[0]?.score).toBeGreaterThan(0);
    recall.close();
  });
});

function makeDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "soulforge-recall-"));
  tempDirs.push(dir);
  return join(dir, "recall.sqlite");
}
