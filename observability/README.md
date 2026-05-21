# observability/

Local-first observability primitives for SoulForge agents. The default sink is append-only JSONL so agents can run on localhost without dashboards, cloud collectors, or managed infrastructure.

## Modules

| Module | Path | Purpose |
| --- | --- | --- |
| JSONL sink | `src/jsonl.ts` | Writes and reads local event files. |
| Cost ledger | `src/cost.ts` | Records token, model, x402, or USDC costs. |
| Latency | `src/latency.ts` | Records latency events and computes percentiles. |
| Errors | `src/errors.ts` | Groups failures by tool, soul version, upstream, and class. |

## Event contract

Every event includes:

- `trace_id`
- `kind`
- `name`
- `ok`
- `at`

Use `session_id`, `turn_id`, `parent_turn_id`, `soul_version`, `tool`, and `upstream` whenever available.

## Default path

```text
~/.soulforge/obs/YYYY-MM-DD.jsonl
```

Override with:

```bash
SOULFORGE_OBS_DIR=.soulforge/obs
```

## Example

```ts
import { CostLedger, JsonlObservabilitySink, LatencyRecorder } from "./src/index.js";

const sink = new JsonlObservabilitySink();
new CostLedger(sink).record({ trace_id: "trace-1", name: "x402.payment", cost_usd: 0.01 });
new LatencyRecorder(sink).record({ trace_id: "trace-1", name: "agent.turn", duration_ms: 42 });
```

## Span hierarchy

Events should nest under a common `trace_id` using `parent_span_id` for multi-step runs:

```
trace (Runner.run)
  └── agent_span (each agent that runs)
        ├── generation_span (each LLM call)
        └── tool_span (each tool invocation)
              └── handoff_span | guardrail_span (when applicable)
```

Use these controlled values for `kind`: `trace`, `agent`, `generation`, `tool`, `handoff`, `guardrail`. This vocabulary makes JSONL output compatible with standard trace viewers without requiring a managed backend.

## Adding a sink

The `JsonlObservabilitySink` is the default. To ship events elsewhere (Langfuse, Datadog, a webhook), implement the `SinkProcessor` interface:

```ts
interface SinkProcessor {
  onEvent(event: ObsEvent): void | Promise<void>;
  flush(): Promise<void>;
}
```

Pass your processor at construction time or replace the default:

```ts
const sink = new JsonlObservabilitySink({ processors: [new MyDatadogProcessor()] });
```

Events still write to JSONL; processors receive a copy. To disable JSONL and use only your processor, set `{ jsonl: false }`.

## Verify

```bash
npm run test -- observability
npm run typecheck
npm run lint
```
