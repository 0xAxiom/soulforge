# eval/

Local-first eval primitives for SoulForge agents. The harness is intentionally plain TypeScript plus JSON files: traces, goldens, scoring, diff, and cache.

It is not a model runtime. The default runner uses deterministic golden replay so the eval machinery can be tested locally without provider credentials. External agent/model runners supply real outputs through the same scoring and trace shape.

## Modules

| Module | Path | Purpose |
| --- | --- | --- |
| Traces | `traces/` | JSONL trace recorder, one record per evaluated turn. |
| Goldens | `goldens/` | Folder-per-soul curated cases. |
| Score | `score/` | Hard assertion, exact, semantic, and judge-backed scorers. |
| Diff | `diff/` | Compare two soul versions over the same goldens. |
| Cache | `cache/` | Content-addressed cache for replay and expensive judge/model calls. |

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SOULFORGE_EVAL_DIR` | no | `~/.soulforge/eval` | Directory for JSONL traces and cache files. |

## Golden Shape

Each golden lives under `eval/goldens/<soul-name>/` and includes:

- `input`
- `expected_behavior`
- `criteria`
- `allowed_tools`
- `refusal_expected`
- `tags`

`expected_behavior.replay_output` is a human-authored replay output used by the local harness. It is not a claim that a model generated the answer.

## Run

```bash
npm install
npm run eval -- run --soul souls/examples/starter-soul.md
npm run eval -- run --soul souls/examples/tool-planner-soul.md
npm run eval -- run --soul souls/examples/eval-judge-soul.md
```

Run output includes a score table, trace path, cache path, pass/fail counts, and cache-hit count.

## Diff

```bash
npm run eval -- diff --a souls/examples/starter-soul.md --b souls/examples/starter-soul.md
```

The diff runs the same goldens for both soul paths and prints a side-by-side score table with regressions highlighted. Comparing the same file is useful as a smoke test; versioned souls can be compared by path.

## Cache

Cache keys are:

```text
sha256(soul_version + input + scorer_version + tool_versions)
```

The implementation hashes a stable JSON object containing those fields. Changing the soul version, scorer version, input, or tool versions invalidates the cache.

## Scoring Tiers

| Scorer | Use |
| --- | --- |
| `hard_assertion` | Refusals, must-include text, must-not-include text. |
| `exact` | Structured or canonical outputs that must match exactly. |
| `semantic` | Deterministic keyword coverage for local smoke tests. |
| `llm_judge` | Judge-shaped scorer using `souls/examples/eval-judge-soul.md` and schema-validated verdicts. |

The default judge is deterministic and local. It validates the structured judge verdict shape and loads the eval judge soul version, but it does not call a model. Provider-backed judge adapters keep the same output schema.

## Epoch Reduction

LLM-backed evals are stochastic: the same input produces different outputs and different scores across runs. Running a golden once and treating the result as ground truth overfits to sampling variance. `epochReduce()` addresses this.

```typescript
import { epochReduce } from "./score/index.js";

// Run the same soul three times against the same goldens
const run1 = runEval({ soulPath: "souls/examples/my-soul.md" }).results;
const run2 = runEval({ soulPath: "souls/examples/my-soul.md" }).results;
const run3 = runEval({ soulPath: "souls/examples/my-soul.md" }).results;

// Collapse to a single result set with stable scores
const stable = epochReduce([run1, run2, run3], "mean");
// or "median" — more robust to outlier runs
const robust = epochReduce([run1, run2, run3], "median");
```

`passed` is determined by majority vote across runs — more than half must pass for the reduced result to pass. This matches how you'd reason about a flaky eval: one pass out of three is suspect; two passes out of three is a real signal.

Use epoch reduction when:
- Goldens use `llm_judge` with a real model (inherently stochastic)
- You're comparing two soul versions and the diff is narrow (within noise)
- A golden is marked flaky but you don't want to delete it — confirm it's actually flaky before removing

## Trace Format

Trace records are JSONL:

```json
{"trace_id":"...","session_id":"...","turn_id":"turn-1","soul_version":"starter@0.1.0","golden_id":"starter-001-truthful-scope","input":"...","tools_called":[],"output":"...","cost_usd":0,"duration_ms":1,"metric_passed":true,"replay":{"mode":"golden-replay","scorer_version":"score.v1","cache_key":"...","cache_hit":false},"created_at":"2026-05-17T00:00:00.000Z"}
```

## Verify

```bash
npm run test -- eval
npm run typecheck
npm run lint
npm run build
```

## Failure Behavior

- Missing golden folders throw a clear error naming the soul.
- Invalid golden JSON fails during load with the offending field path.
- Judge verdicts are schema-validated before scoring.
- Failed eval runs print failing golden IDs.
- Diff exits non-zero when regressions are detected.

## Current Goldens

There are five hand-authored goldens for each existing soul:

- `starter`
- `tool-planner`
- `eval-judge`

Each folder includes at least one refusal/negative case.

## Boundaries

- The default runner is deterministic replay, not a real agent execution loop.
- The semantic scorer is keyword coverage for local regression smoke tests, not an embedding model.
- The default judge is local and deterministic; provider-backed LLM judging uses the same structured verdict contract.
- Goldens are hand-authored first. Trace bootstrapping should wait for real agent traffic.
