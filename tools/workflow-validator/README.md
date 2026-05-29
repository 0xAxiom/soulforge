# tools/workflow-validator/

Build-time validation for `WorkflowDefinition` objects before they reach `WorkflowRunner`. Implements the Haystack "socket validation" insight from `research/2026-05-28-haystack.md`: most wiring errors are detectable at assembly time, not at 3am when a step fails in production.

## Why

The `workflow-runner` catches shape errors at runtime (when a step returns a non-object). `workflow-validator` catches structural errors at definition time — before `runner.run()` is ever called. This gives you:

- Safe checkpoint directories (pipelineId sanitized against path traversal)
- No duplicate step names (checkpoint files would collide)
- No duplicate `output_event_type` values (downstream consumers can't unambiguously route events)
- Readable error messages with error codes for programmatic handling

## What it validates

| Check | Code | Kind |
| --- | --- | --- |
| pipelineId is non-empty | `EMPTY_PIPELINE_ID` | error |
| pipelineId is path-safe (no `/`, `..`, etc.) | `UNSAFE_PIPELINE_ID` | error |
| steps array is non-empty | `EMPTY_STEPS` | error |
| step name is non-empty | `EMPTY_STEP_NAME` | error |
| step names are unique within pipeline | `DUPLICATE_STEP_NAME` | error |
| output_event_type is non-empty | `EMPTY_OUTPUT_EVENT_TYPE` | error |
| output_event_types are unique within pipeline | `DUPLICATE_OUTPUT_EVENT_TYPE` | error |
| step.run is a function | `STEP_RUN_NOT_FUNCTION` | error |
| step name matches pipelineId | `STEP_NAME_MATCHES_PIPELINE_ID` | warning |

## Usage

```ts
import { WorkflowValidator } from "./tools/workflow-validator/src/index.js";

const validator = new WorkflowValidator();

// Returns a ValidationResult — inspect errors/warnings yourself
const result = validator.validate(myWorkflow);
if (!result.valid) {
  result.errors.forEach(e => console.error(`[${e.code}] ${e.message}`));
}

// Or throw on invalid — useful in pipeline setup code
validator.assertValid(myWorkflow); // throws WorkflowValidationError if invalid
```

## Integration with WorkflowRunner

```ts
import { WorkflowRunner } from "../workflow-runner/src/index.js";
import { WorkflowValidator } from "../workflow-validator/src/index.js";

const validator = new WorkflowValidator();
const runner = new WorkflowRunner();

// Validate before running — catch errors at assembly time
validator.assertValid(definition);
const result = await runner.run(definition);
```

## Run the demo

```bash
tsx tools/workflow-validator/examples/validate-demo.ts
```

## Run tests

```bash
npx vitest run tools/workflow-validator/src/validator.test.ts
```

Tests cover: valid workflow, empty pipelineId, unsafe pipelineId, empty steps, duplicate step names, duplicate output_event_types, empty event type, non-function run, warning on name collision, assertValid throws, multi-error accumulation.

## Files

| Path | Purpose |
| --- | --- |
| `src/index.ts` | `WorkflowValidator`, `WorkflowValidationError`, types |
| `src/validator.test.ts` | Vitest tests (11 cases) |
| `examples/validate-demo.ts` | Runnable demo with 5 scenarios |

## Design notes

`output_event_type` uniqueness comes directly from Haystack's socket-naming discipline: each component's output socket must be uniquely named so the pipeline graph can validate connections. Soulforge's `workflow-runner` already carries `output_event_type` on every step — this validator makes the uniqueness constraint explicit and machine-checkable.
