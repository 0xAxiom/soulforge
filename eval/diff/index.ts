import { basename } from "node:path";
import { runEval } from "../src/runner.js";
import type { EvalRunSummary } from "../src/runner.js";

export interface EvalDiffOptions {
  readonly soulAPath: string;
  readonly soulBPath: string;
  readonly evalDir?: string;
  readonly goldensRoot?: string;
}

export interface EvalDiffSummary {
  readonly a: EvalRunSummary;
  readonly b: EvalRunSummary;
  readonly regressions: readonly string[];
}

export function runEvalDiff(options: EvalDiffOptions): EvalDiffSummary {
  const sessionId = crypto.randomUUID();
  const aOptions = {
    soulPath: options.soulAPath,
    sessionId: `${sessionId}-a`
  };
  const bOptions = {
    soulPath: options.soulBPath,
    sessionId: `${sessionId}-b`
  };
  const a = runEval(addOptionalRunOptions(aOptions, options));
  const b = runEval(addOptionalRunOptions(bOptions, options));
  const regressions = a.results
    .filter((left) => {
      const right = b.results.find((candidate) => candidate.golden_id === left.golden_id);
      return right !== undefined && left.passed && (!right.passed || right.score < left.score);
    })
    .map((result) => result.golden_id);
  return { a, b, regressions };
}

function addOptionalRunOptions<T extends { readonly soulPath: string; readonly sessionId: string }>(
  base: T,
  options: EvalDiffOptions
): T & { readonly evalDir?: string; readonly goldensRoot?: string } {
  return {
    ...base,
    ...(options.evalDir === undefined ? {} : { evalDir: options.evalDir }),
    ...(options.goldensRoot === undefined ? {} : { goldensRoot: options.goldensRoot })
  };
}

export function formatDiffSummary(summary: EvalDiffSummary): string {
  const lines = [
    `Eval diff ${basename(summary.a.soul.path)} -> ${basename(summary.b.soul.path)}`,
    "",
    "golden | a score | b score | delta | regression",
    "--- | --- | --- | --- | ---"
  ];
  for (const left of summary.a.results) {
    const right = summary.b.results.find((candidate) => candidate.golden_id === left.golden_id);
    if (right === undefined) {
      lines.push(`${left.golden_id} | ${left.score.toFixed(2)} | missing | n/a | yes`);
      continue;
    }
    const delta = right.score - left.score;
    const regression = summary.regressions.includes(left.golden_id);
    lines.push(
      `${left.golden_id} | ${left.score.toFixed(2)} | ${right.score.toFixed(2)} | ${delta.toFixed(2)} | ${
        regression ? "yes" : "no"
      }`
    );
  }
  lines.push("");
  lines.push(`Regressions: ${summary.regressions.length === 0 ? "none" : summary.regressions.join(", ")}`);
  return lines.join("\n");
}
