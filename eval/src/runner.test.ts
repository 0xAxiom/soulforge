import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runEval } from "./runner.js";
import { runEvalDiff } from "../diff/index.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runEval", () => {
  it("runs goldens, writes traces, and hits cache on replay", () => {
    const evalDir = makeTempDir();
    const first = runEval({
      soulPath: "souls/examples/starter-soul.md",
      evalDir,
      tracePath: join(evalDir, "first.jsonl"),
      sessionId: "session-1"
    });
    const second = runEval({
      soulPath: "souls/examples/starter-soul.md",
      evalDir,
      tracePath: join(evalDir, "second.jsonl"),
      sessionId: "session-2"
    });

    expect(first.failed).toBe(0);
    expect(first.results).toHaveLength(5);
    expect(second.cacheHits).toBe(5);
    expect(readFileSync(first.tracePath, "utf8").trim().split("\n")).toHaveLength(5);
    expect(readFileSync(second.tracePath, "utf8")).toContain("\"cache_hit\":true");
  });

  it("diffs two soul paths with the same goldens", () => {
    const summary = runEvalDiff({
      soulAPath: "souls/examples/starter-soul.md",
      soulBPath: "souls/examples/starter-soul.md",
      evalDir: makeTempDir()
    });

    expect(summary.regressions).toEqual([]);
    expect(summary.a.results).toHaveLength(5);
    expect(summary.b.results).toHaveLength(5);
  });
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "soulforge-eval-runner-"));
  tempDirs.push(dir);
  return dir;
}
