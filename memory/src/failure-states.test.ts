import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { LongTermMemoryStore } from "./long-term.js";
import type { EmbeddingBackend } from "./recall.js";
import { SqliteRecallStore } from "./recall.js";
import { ReflectionPipeline } from "./reflect.js";
import { JsonlMemoryTelemetrySink } from "./telemetry.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("memory failure states", () => {
  it("fails clearly when the memory directory is missing", () => {
    const missingPath = join(tmpdir(), `soulforge-missing-${crypto.randomUUID()}`, "memory.sqlite");

    expect(() => new LongTermMemoryStore(missingPath)).toThrow(/directory does not exist/);
    expect(() => new SqliteRecallStore(missingPath)).toThrow(/directory does not exist/);
  });

  it("surfaces corrupt SQLite databases", () => {
    const dir = makeTempDir("corrupt");
    const dbPath = join(dir, "memory.sqlite");
    writeFileSync(dbPath, "not sqlite", "utf8");

    expect(() => new LongTermMemoryStore(dbPath)).toThrow();
  });

  it("rejects malformed reflection input and empty transcripts", () => {
    const dir = makeTempDir("malformed-reflection");
    const longTerm = new LongTermMemoryStore(join(dir, "long.sqlite"));
    const recall = new SqliteRecallStore(join(dir, "recall.sqlite"));
    const pipeline = new ReflectionPipeline({ longTerm, recall });

    expect(() => pipeline.run({ sessionId: "s", transcript: [] })).toThrow(/at least one transcript turn/);
    expect(() => pipeline.run({ sessionId: "s", transcript: [{ role: "user", content: " " }] })).toThrow(
      /non-empty content/
    );

    longTerm.close();
    recall.close();
  });

  it("emits failed telemetry when reflection persistence is interrupted", () => {
    const dir = makeTempDir("interrupted-reflection");
    const longTerm = new LongTermMemoryStore(join(dir, "long.sqlite"));
    const recall = new SqliteRecallStore(join(dir, "recall.sqlite"));
    const telemetryPath = join(dir, "events.jsonl");
    const pipeline = new ReflectionPipeline({
      longTerm,
      recall,
      telemetry: new JsonlMemoryTelemetrySink(telemetryPath)
    });
    longTerm.close();

    expect(() =>
      pipeline.run({
        traceId: "trace-interrupted",
        sessionId: "session-interrupted",
        transcript: [{ role: "user", content: "Remember this." }]
      })
    ).toThrow();
    expect(readFileSync(telemetryPath, "utf8")).toContain("\"ok\":false");

    recall.close();
  });

  it("surfaces recall backend unavailability", () => {
    const dir = makeTempDir("recall-unavailable");
    const recall = new SqliteRecallStore(join(dir, "recall.sqlite"), new FailingEmbeddingBackend());

    expect(() => recall.add({ id: "x", text: "hello" })).toThrow(/embedding backend unavailable/);
    recall.close();
  });

  it("rejects invalid tags", () => {
    const store = new LongTermMemoryStore(join(makeTempDir("invalid-tags"), "memory.sqlite"));

    expect(() => store.put({ key: "x", value: "y", tags: ["Bad Tag"] })).toThrow(/Invalid memory tag/);
    store.close();
  });
});

class FailingEmbeddingBackend implements EmbeddingBackend {
  readonly name = "failing-test-backend";
  readonly dimensions = 8;

  embed(): number[] {
    throw new Error("embedding backend unavailable");
  }
}

function makeTempDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `soulforge-${label}-`));
  tempDirs.push(dir);
  return dir;
}
