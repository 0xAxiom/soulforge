import { performance } from "node:perf_hooks";
import { EvalCache, createCacheKey } from "../cache/index.js";
import { loadGoldensForSoul } from "../goldens/index.js";
import { scoreGolden, SCORER_VERSION } from "../score/index.js";
import { JsonlTraceRecorder } from "../traces/index.js";
import type { TraceRecord } from "../traces/index.js";
import { stableJson } from "./json.js";
import { defaultCacheDir, defaultEvalDir, defaultTracePath } from "./paths.js";
import { loadSoul } from "./soul.js";
import type { EvalResult, GoldenCase, JsonObject, SoulMetadata } from "./types.js";

export interface EvalRunOptions {
  readonly soulPath: string;
  readonly goldensRoot?: string;
  readonly evalDir?: string;
  readonly tracePath?: string;
  readonly sessionId?: string;
  readonly useCache?: boolean;
}

export interface EvalRunSummary {
  readonly soul: SoulMetadata;
  readonly results: readonly EvalResult[];
  readonly tracePath: string;
  readonly cacheDir: string;
  readonly passed: number;
  readonly failed: number;
  readonly cacheHits: number;
}

export function runEval(options: EvalRunOptions): EvalRunSummary {
  const soul = loadSoul(options.soulPath);
  const evalDir = options.evalDir ?? defaultEvalDir();
  const tracePath = options.tracePath ?? defaultTracePath(soul.name, evalDir);
  const cacheDir = defaultCacheDir(evalDir);
  const cache = new EvalCache(cacheDir);
  const recorder = new JsonlTraceRecorder(tracePath);
  const goldens = loadGoldensForSoul(soul.name, options.goldensRoot);
  if (goldens.length === 0) throw new Error(`No goldens found for ${soul.name}`);
  const sessionId = options.sessionId ?? crypto.randomUUID();
  const results = goldens.map((golden, index) =>
    runGolden({
      soul,
      golden,
      cache,
      recorder,
      sessionId,
      turnId: `turn-${String(index + 1)}`,
      useCache: options.useCache ?? true
    })
  );
  return {
    soul,
    results,
    tracePath,
    cacheDir,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    cacheHits: results.filter((result) => result.cache_hit).length
  };
}

interface RunGoldenInput {
  readonly soul: SoulMetadata;
  readonly golden: GoldenCase;
  readonly cache: EvalCache;
  readonly recorder: JsonlTraceRecorder;
  readonly sessionId: string;
  readonly turnId: string;
  readonly useCache: boolean;
}

function runGolden(input: RunGoldenInput): EvalResult {
  const startedAt = performance.now();
  const toolVersions = toolVersionsForGolden(input.golden);
  const cacheKey = createCacheKey({
    soul_version: input.soul.soul_version,
    input: input.golden.input,
    scorer_version: SCORER_VERSION,
    tool_versions: toolVersions
  });
  const cached = input.useCache ? input.cache.read(cacheKey) : null;
  const traceId = crypto.randomUUID();
  if (cached !== null) {
    const result = {
      ...cached,
      cache_hit: true,
      trace_id: traceId,
      session_id: input.sessionId,
      turn_id: input.turnId,
      duration_ms: Math.round(performance.now() - startedAt)
    };
    input.recorder.append(traceFromResult(input.soul, input.golden, result, cacheKey));
    return result;
  }

  const output = input.golden.expected_behavior.replay_output;
  const score = scoreGolden(input.soul, input.golden, output);
  const result = {
    golden_id: input.golden.id,
    soul_version: input.soul.soul_version,
    input: input.golden.input,
    output,
    passed: score.passed,
    score: score.score,
    details: score.details,
    cache_hit: false,
    trace_id: traceId,
    session_id: input.sessionId,
    turn_id: input.turnId,
    duration_ms: Math.round(performance.now() - startedAt)
  };
  input.cache.write(cacheKey, result);
  input.recorder.append(traceFromResult(input.soul, input.golden, result, cacheKey));
  return result;
}

function traceFromResult(soul: SoulMetadata, golden: GoldenCase, result: EvalResult, cacheKey: string): TraceRecord {
  return {
    trace_id: result.trace_id,
    session_id: result.session_id,
    turn_id: result.turn_id,
    soul_version: soul.soul_version,
    golden_id: golden.id,
    input: result.input,
    tools_called: golden.allowed_tools,
    output: result.output,
    cost_usd: 0,
    duration_ms: result.duration_ms,
    metric_passed: result.passed,
    replay: {
      mode: "golden-replay",
      scorer_version: SCORER_VERSION,
      cache_key: cacheKey,
      cache_hit: result.cache_hit
    },
    created_at: new Date().toISOString()
  };
}

function toolVersionsForGolden(golden: GoldenCase): JsonObject {
  if (golden.tool_versions !== undefined) return golden.tool_versions;
  return Object.fromEntries(golden.allowed_tools.map((tool) => [tool, "local:v1"]));
}

export function formatRunSummary(summary: EvalRunSummary): string {
  const lines = [
    `Eval run for ${summary.soul.soul_version}`,
    `Trace: ${summary.tracePath}`,
    `Cache: ${summary.cacheDir}`,
    "",
    "golden | pass | score | cache | details",
    "--- | --- | --- | --- | ---"
  ];
  for (const result of summary.results) {
    const details = result.details.map((detail) => `${detail.criterion}:${detail.passed ? "pass" : "fail"}`).join(", ");
    lines.push(
      `${result.golden_id} | ${result.passed ? "yes" : "no"} | ${result.score.toFixed(2)} | ${
        result.cache_hit ? "hit" : "miss"
      } | ${details}`
    );
  }
  lines.push("");
  lines.push(`Summary: ${String(summary.passed)} passed, ${String(summary.failed)} failed, ${String(summary.cacheHits)} cache hits.`);
  const failures = summary.results.filter((result) => !result.passed);
  if (failures.length > 0) {
    lines.push(`Failures: ${failures.map((result) => result.golden_id).join(", ")}`);
  }
  return lines.join("\n");
}

export function deterministicRunFingerprint(summary: EvalRunSummary): string {
  return stableJson({
    soul_version: summary.soul.soul_version,
    results: summary.results.map((result) => ({
      golden_id: result.golden_id,
      passed: result.passed,
      score: result.score
    }))
  });
}
