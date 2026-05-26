import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { runEval } from "../../../../eval/src/runner.js";

// ── eval_run ──────────────────────────────────────────────────────────────────

export interface EvalRunInput {
  soul_path?: string;
  golden_set?: string;
  max_goldens?: number;
}

export interface EvalRunOutput {
  soul_version: string;
  golden_set: string;
  scores: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
  };
  failures: Array<{
    golden_id: string;
    expected: string;
    actual: string;
    scorer: string;
  }>;
  cache_hits: number;
  cost_usd: number;
}

const soulsDir = resolve(
  new URL("../../../..", import.meta.url).pathname,
  "souls/examples"
);

export function evalRun(input: EvalRunInput): EvalRunOutput {
  const soulPath =
    input.soul_path != null
      ? resolve(input.soul_path)
      : join(soulsDir, "starter-soul.md");

  if (!existsSync(soulPath)) {
    throw new Error(`Soul not found: ${soulPath}`);
  }

  const summary = runEval({ soulPath, useCache: true });

  const limit = input.max_goldens ?? summary.results.length;
  const results = summary.results.slice(0, limit);

  const failures = results
    .filter((r) => !r.passed)
    .flatMap((r) =>
      r.details
        .filter((d) => !d.passed)
        .map((d) => ({
          golden_id: r.golden_id,
          expected: d.criterion,
          actual: d.reason,
          scorer: d.scorer,
        }))
    );

  return {
    soul_version: summary.soul.soul_version,
    golden_set: summary.soul.name,
    scores: {
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      skipped: summary.results.length - results.length,
      total: summary.results.length,
    },
    failures,
    cache_hits: summary.cacheHits,
    // Goldens use local scoring only — no LLM cost in the default path.
    cost_usd: 0,
  };
}
