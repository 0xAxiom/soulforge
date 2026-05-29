# tools/workflow-runner/

TypeScript runtime for deterministic multi-step workflows with checkpoint-based resume. Implements the execution model documented in `souls/examples/deterministic-workflow-soul.md`.

## What it does

- Runs a `WorkflowDefinition` (ordered array of `WorkflowStepDefinition` steps) one step at a time
- Passes accumulated handoff data between steps (each step reads from and writes to a shared record)
- Writes a `StepCheckpoint` to disk after each successful step
- Resumes from the last checkpoint if called again with the same `pipelineId` — already-completed steps are skipped
- Halts on any step failure and returns a typed `WorkflowResult` with the failing step name and error
- Validates that each step returns a plain non-null object (rejects primitives and arrays)

## Design notes

The checkpoint schema (`pipeline_id`, `step_name`, `step_index`, `output_event_type`, `output_payload`, `completed_at`, `wall_time_ms`) comes from the LlamaIndex WorkflowCheckpointer research (2026-05-27) and is the same minimal record documented in `deterministic-workflow-soul.md`.

The `output_event_type` field on each step borrows Haystack's socket-naming discipline (2026-05-28): steps declare the *name* of the event they produce, not just the keys they write. This gives orchestrators a machine-readable signal for wiring validation before execution.

## Contract

| Input | Type | Description |
| --- | --- | --- |
| `WorkflowDefinition` | `{ pipelineId, steps }` | Pipeline identity and ordered step array |
| `WorkflowRunOptions` | `{ checkpointDir?, traceId? }` | Overrides default checkpoint dir |

| Output | Type | Description |
| --- | --- | --- |
| `WorkflowResult` | see types | Completion status, step results, final handoff data, resume info |
| `StepCheckpoint` files | JSON on disk | One file per completed step under `<checkpointDir>/<pipelineId>/` |

## Run the example

```bash
tsx tools/workflow-runner/examples/text-pipeline.ts
```

Output shows a 3-step text processing pipeline (fetch → extract-keywords → summarize), checkpoint files written to `.tmp/`, and a second run that loads all steps from checkpoints and runs zero additional steps.

## Run tests

```bash
npx vitest run tools/workflow-runner/src/runner.test.ts
```

Tests cover: basic run, checkpoint writing, step failure halting, resume from checkpoint, handoff data accumulation, and shape validation rejection.

## Files

| Path | Purpose |
| --- | --- |
| `src/index.ts` | `WorkflowRunner`, types, error classes |
| `src/runner.test.ts` | Vitest tests (7 cases) |
| `examples/text-pipeline.ts` | Runnable 3-step demo with resume |
