#!/usr/bin/env node
import { formatDiffSummary, runEvalDiff } from "./diff/index.js";
import { formatRunSummary, runEval } from "./src/runner.js";

const args = process.argv.slice(2);
const command = args[0];

try {
  if (command === "run") {
    const soul = readFlag(args, "--soul");
    if (soul === null) throw new Error("Usage: npm run eval -- run --soul <path>");
    const evalDir = readFlag(args, "--eval-dir");
    const summary = runEval(evalDir === null ? { soulPath: soul } : { soulPath: soul, evalDir });
    console.log(formatRunSummary(summary));
    process.exitCode = summary.failed > 0 ? 1 : 0;
  } else if (command === "diff") {
    const a = readFlag(args, "--a");
    const b = readFlag(args, "--b");
    if (a === null || b === null) throw new Error("Usage: npm run eval -- diff --a <soul-a> --b <soul-b>");
    const evalDir = readFlag(args, "--eval-dir");
    const summary = runEvalDiff(
      evalDir === null ? { soulAPath: a, soulBPath: b } : { soulAPath: a, soulBPath: b, evalDir }
    );
    console.log(formatDiffSummary(summary));
    process.exitCode = summary.regressions.length > 0 ? 1 : 0;
  } else {
    throw new Error("Usage: npm run eval -- <run|diff> ...");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unknown eval error");
  process.exitCode = 1;
}

function readFlag(values: readonly string[], flag: string): string | null {
  const index = values.indexOf(flag);
  if (index === -1) return null;
  return values[index + 1] ?? null;
}
