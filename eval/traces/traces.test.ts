import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlTraceRecorder } from "./index.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("JsonlTraceRecorder", () => {
  it("writes one JSONL record per agent turn", () => {
    const dir = mkdtempSync(join(tmpdir(), "soulforge-traces-"));
    tempDirs.push(dir);
    const path = join(dir, "trace.jsonl");
    const recorder = new JsonlTraceRecorder(path);

    recorder.append({
      trace_id: "trace",
      session_id: "session",
      turn_id: "turn-1",
      soul_version: "starter@0.1.0",
      golden_id: "starter-001",
      input: "hello",
      tools_called: [],
      output: "world",
      cost_usd: 0,
      duration_ms: 1,
      metric_passed: true,
      replay: {
        mode: "golden-replay",
        scorer_version: "score.v1",
        cache_key: "abc",
        cache_hit: false
      },
      created_at: "2026-05-17T00:00:00.000Z"
    });

    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("\"trace_id\":\"trace\"");
  });
});
