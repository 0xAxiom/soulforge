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

## Verify

```bash
npm run test -- observability
npm run typecheck
npm run lint
```
