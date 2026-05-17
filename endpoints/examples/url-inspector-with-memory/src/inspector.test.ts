import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { UrlInspectorWithMemory } from "./inspector.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("UrlInspectorWithMemory", () => {
  it("recalls prior inspections and persists reflection summaries", () => {
    const agent = new UrlInspectorWithMemory({ dataDir: makeTempDir() });

    const first = agent.inspect({
      url: "https://example.com",
      html: "<title>Example Domain</title><meta name=\"description\" content=\"Docs page\"><a href=\"/x\">x</a>"
    });
    const second = agent.inspect({
      url: "https://example.com/docs",
      html: "<title>Example Docs</title><p>Docs page with repeated metadata topic.</p>"
    });
    const reflection = agent.reflect("session", [
      { role: "user", content: "Remember metadata quality for example.com." },
      { role: "assistant", content: "We decided to persist inspection summaries." }
    ]);

    expect(first.title).toBe("Example Domain");
    expect(second.historicalRecall.length).toBeGreaterThan(0);
    expect(agent.recallSimilar("example.com metadata docs")[0]?.text).toContain("Example");
    expect(reflection.summary).toContain("Session session contained 2 turns.");
    agent.close();
  });
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "url-inspector-memory-"));
  tempDirs.push(dir);
  return dir;
}
