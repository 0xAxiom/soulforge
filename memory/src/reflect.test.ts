import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { LongTermMemoryStore } from "./long-term.js";
import { SqliteRecallStore } from "./recall.js";
import { ReflectionPipeline } from "./reflect.js";
import { JsonlMemoryTelemetrySink } from "./telemetry.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ReflectionPipeline", () => {
  it("summarizes a transcript into long-term memory, recall, and telemetry", () => {
    const dir = mkdtempSync(join(tmpdir(), "soulforge-reflect-"));
    tempDirs.push(dir);
    const longTerm = new LongTermMemoryStore(join(dir, "long.sqlite"));
    const recall = new SqliteRecallStore(join(dir, "recall.sqlite"));
    const telemetryPath = join(dir, "memory.jsonl");
    const pipeline = new ReflectionPipeline({
      longTerm,
      recall,
      telemetry: new JsonlMemoryTelemetrySink(telemetryPath)
    });

    const summary = pipeline.run({
      traceId: "trace-test",
      sessionId: "session-1",
      transcript: [
        { role: "user", content: "Remember that URL inspector results should include historical recall." },
        { role: "assistant", content: "We decided to persist summaries and recall vectors locally." }
      ],
      tags: ["url-inspector"]
    });

    expect(summary.summary).toContain("Session session-1 contained 2 turns.");
    expect(longTerm.get("reflection:session-1")?.tags).toContain("reflection");
    expect(recall.query("historical recall url inspector", { limit: 1 })[0]?.id).toBe("reflection:session-1");
    expect(readFileSync(telemetryPath, "utf8")).toContain("\"traceId\":\"trace-test\"");

    longTerm.close();
    recall.close();
  });
});
