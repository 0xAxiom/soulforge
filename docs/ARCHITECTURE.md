# SoulForge Architecture

## The five primitives

An agent is the composition of five primitives. The repo is organized so each gets equal weight.

```
                  ┌─────────────┐
                  │    SOUL     │  ← identity, voice, values, limits
                  └──────┬──────┘
                         │ informs
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌──────────┐ ┌────────┐
         │ TOOLS  │ │ MEMORY   │ │  EVAL  │
         └────┬───┘ └────┬─────┘ └───┬────┘
              │          │           │
              └──────────┼───────────┘
                         ▼
                  ┌─────────────┐
                  │  ENDPOINTS  │  ← outward surface, paid or free
                  └─────────────┘
```

| Primitive       | Lives in            | Owns                                                |
| --------------- | ------------------- | --------------------------------------------------- |
| Soul            | `souls/`            | Identity, voice, refusal conditions, scope          |
| Tools           | (per agent)         | Typed capabilities — local fns, HTTP, MCP, x402     |
| Endpoints       | `endpoints/`        | How the agent is reached — paid (x402), free, webhook |
| Memory          | `memory/`           | Short-term scratch, long-term store, retrieval       |
| Eval            | `eval/`             | Traces, golden tests, regression scoring             |
| Observability\* | `observability/`    | Cost tracking, latency, error surfacing              |

\* Observability is technically cross-cutting, not a fifth peer to the soul-tools-endpoints-memory-eval set. It earns its own folder because shipping agents without it is malpractice and it tends to get forgotten if not made explicit.

## Why this shape

Most agent frameworks collapse these. They put soul and tools in the same Python class, treat memory as "just a vector store," and bolt eval on as an afterthought. That works for demos. It collapses under multi-month iteration.

The five-primitive shape says:

- A soul should be editable by a non-engineer. → markdown, not code.
- A tool's contract is its types. → typed schemas, not freeform JSON.
- An endpoint's pricing is part of its API. → x402 manifest, not a Stripe config in a different repo.
- Memory has multiple lifecycles. → short-term, long-term, embedding — different storage, different APIs.
- Eval is part of the agent. → in the same repo as the soul, not a separate analytics project.

## How they compose

A complete agent picks from each primitive:

```
my-agent/
├── soul.md                ← from souls/ schema
├── tools/                 ← typed handlers
├── endpoints/
│   └── api/<route>.ts     ← from endpoints/ template (likely x402)
├── memory/                ← storage adapter chosen from memory/ options
└── eval/                  ← golden cases + harness from eval/
```

SoulForge does not generate this layout automatically (yet). v1 is the primitives. Generation comes after the primitives have stabilized.

## What changes between v1 and v2

| v1 (today)                                                         | v2 (next)                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Soul schema + one example                                          | Soul renderer + soul → system-prompt compiler                              |
| x402 endpoint template + working demo                              | Free / webhook templates; multi-endpoint composition                        |
| Memory: README only                                                | Short-term (KV), long-term (SQLite), embeddings (turbopuffer or pgvector) |
| Eval: README only                                                  | Trace recorder, scorecard runner, regression diff                          |
| Observability: README only                                         | Cost ledger, latency P95 dashboard, error grouping                          |
| No generator                                                       | `soulforge new <agent-name>` scaffolds a complete agent from the primitives |

## What this is not

- **Not a runtime.** There is no `soulforge` Node package. Examples are standalone projects.
- **Not opinionated about provider.** Anthropic, OpenAI, local, mix — the soul schema is provider-agnostic.
- **Not opinionated about hosting.** Demos deploy to Vercel because Vercel is fast. Production agents may run anywhere.
- **Not a framework that you import.** The repo provides schemas, templates, and reference implementations you copy into your own project.

The bet: primitives + good examples > a framework that locks you into a stack.
