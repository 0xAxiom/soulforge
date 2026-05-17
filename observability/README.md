# observability/

> **v1 placeholder.** No runnable code in this folder yet. This README is the design intent. v2 will land the actual instrumentation.

Observability is technically cross-cutting, not a fifth peer to the soul-tools-endpoints-memory-eval set. It earns its own folder anyway because shipping agents without it is malpractice and it tends to get forgotten if not made explicit.

## What to measure

| Signal           | Why                                                                       |
| ---------------- | ------------------------------------------------------------------------- |
| **Cost**         | Agents that call paid models / paid x402 endpoints can rack up bills fast. Track per-conversation and per-tool-call. |
| **Latency**      | P50 / P95 / P99 per endpoint. Slow agents lose users.                      |
| **Errors**       | Grouped by tool, by soul version, by upstream provider. Singletons are usually fine; clusters indicate a real problem. |
| **Tool usage**   | Which tools fire most? Which souls call which tools? Inform pruning.       |
| **Refusal rate** | Should be approximately flat. Spikes indicate prompt drift or upstream model changes. |

## Planned primitives (v2)

```
observability/
├── cost/              ← Per-turn token + USDC ledger
├── latency/           ← Histogram primitives + dashboard generator
├── errors/            ← Error grouping with sampling
└── adapter/           ← OTel exporter for sending to Honeycomb / Grafana / etc.
```

## How it composes with the other primitives

| Composes with | How                                                                          |
| ------------- | ---------------------------------------------------------------------------- |
| Soul          | Every emit tagged with soul `name@version` so you can A/B versions.          |
| Tools         | Each tool call wrapped in a span; cost and latency attributed.               |
| Endpoints     | Middleware emits cost-collected + payment-verified counters.                  |
| Memory        | Recall calls timed; cache hit rate tracked.                                  |
| Eval          | Eval runs export traces the same shape as production. Same dashboards work for both. |

## Open design questions

1. **Sink.** OTel + Honeycomb is the obvious answer for prod. What's the default for local dev? Probably JSONL to a file + a `tail`-friendly format.
2. **Sampling.** 100% in dev, sampled in prod, full in eval. Where does the sample rate config live? In the soul? In env? In a separate observability config?
3. **PII handling.** Traces capture user inputs. How is redaction wired in?
4. **Cost attribution boundary.** A multi-tool turn calls 3 paid x402 endpoints. Does the cost roll up to the turn, the soul, or the calling user?

## Why this is a stub today

Observability built without traffic to observe is theater. v2 lands once the first real agent is shipped and there's actually something to instrument.
