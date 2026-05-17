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
    const persisted = longTerm.get("reflection:session-1");
    expect(persisted?.tags).toContain("reflection");
    expect(persisted?.provenance.source_transcript_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted?.provenance.model_provider).toBe("local");
    const recalled = recall.query("historical recall url inspector", { limit: 1 })[0];
    expect(recalled?.id).toBe("reflection:session-1");
    expect(recalled?.provenance.reflection_strategy_version).toBe("extractive-summary.v1");
    const telemetry = readFileSync(telemetryPath, "utf8");
    expect(telemetry).toContain("\"trace_id\":\"trace-test\"");
    expect(telemetry).toContain("\"session_id\":\"session-1\"");

    longTerm.close();
    recall.close();
  });
});
