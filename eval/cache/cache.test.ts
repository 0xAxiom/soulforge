import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { EvalCache, createCacheKey } from "./index.js";
import type { EvalResult } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("EvalCache", () => {
  it("uses soul, input, scorer, and tool versions in the content-addressed key", () => {
    const base = {
      soul_version: "starter@0.1.0",
      input: "hello",
      scorer_version: "score.v1",
      tool_versions: { read_file: "local:v1" }
    };

    expect(createCacheKey(base)).toBe(createCacheKey({ ...base }));
    expect(createCacheKey({ ...base, scorer_version: "score.v2" })).not.toBe(createCacheKey(base));
    expect(createCacheKey({ ...base, soul_version: "starter@0.2.0" })).not.toBe(createCacheKey(base));
  });

  it("round-trips eval results", () => {
    const cache = new EvalCache(makeTempDir());
    const key = createCacheKey({
      soul_version: "starter@0.1.0",
      input: "hello",
      scorer_version: "score.v1",
      tool_versions: {}
    });
    const result: EvalResult = {
      golden_id: "g1",
      soul_version: "starter@0.1.0",
      input: "hello",
      output: "world",
      passed: true,
      score: 1,
      details: [],
      cache_hit: false,
      trace_id: "trace",
      session_id: "session",
      turn_id: "turn",
      duration_ms: 1
    };

    cache.write(key, result);

    expect(cache.read(key)?.output).toBe("world");
  });
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "soulforge-eval-cache-"));
  tempDirs.push(dir);
  return dir;
}
