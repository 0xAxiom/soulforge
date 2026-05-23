# memory/

Local-first memory primitives for SoulForge agents. Memory is explicit infrastructure, not hidden agent state: callers choose paths, trigger reflection manually, and persist provenance so evals and humans can replay what happened.

## Contract

| Layer | Inputs | Outputs | Side effects | Replay guarantee |
| --- | --- | --- | --- | --- |
| Short-term | typed key/value entries | in-process entries | `Map` mutation only | inspectable during process lifetime |
| Long-term | namespace, key, JSON value, tags, TTL, provenance | SQLite record | local SQLite write | stable id, timestamps, provenance |
| Recall | id, text, metadata, embedding backend | ranked recall results | local SQLite vector write | deterministic local hash embeddings |
| Reflect | session id, transcript turns, tags, correlation ids | summary, facts, decisions, open questions | long-term + recall writes, telemetry | transcript SHA-256 and provenance |

## Modules

| Module | Path | Purpose |
| --- | --- | --- |
| Short-term | `src/short-term.ts` | Per-session scratch state with a typed `Map` API. |
| Long-term | `src/long-term.ts` | SQLite key/value memory with tags, optional TTL, and provenance metadata. |
| Recall | `src/recall.ts` | SQLite recall store with deterministic local hash embeddings. |
| Reflect | `src/reflect.ts` | Manual transcript summarization into long-term memory and recall. |
| Telemetry | `src/telemetry.ts` | JSONL memory events with trace/session/turn correlation. |

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SOULFORGE_MEMORY_DIR` | no | `~/.soulforge/memory-demo` | Directory used by `npm run memory:example`. |

The primitives accept explicit SQLite paths and do not read env vars directly. Callers create directories before opening SQLite. Missing parent directories throw immediately so memory is never silently created in the wrong place.

## Run

```bash
npm install
npm run memory:example
```

The example writes `long-term.sqlite`, `recall.sqlite`, and `memory-events.jsonl` under `SOULFORGE_MEMORY_DIR`.

## Verify

```bash
npm run test -- memory
npm run typecheck
npm run lint
```

## API

```ts
import {
  LongTermMemoryStore,
  ReflectionPipeline,
  ShortTermMemory,
  SqliteRecallStore
} from "./memory/src/index.js";

const shortTerm = new ShortTermMemory<string>();
shortTerm.set("current-url", "https://example.com");

const longTerm = new LongTermMemoryStore("./data/memory.sqlite");
longTerm.put({
  key: "preference:tone",
  value: { tone: "terse" },
  tags: ["preference"],
  provenance: { soul_version: "starter@0.1.0" }
});

const recall = new SqliteRecallStore("./data/recall.sqlite");
recall.add({
  id: "decision-1",
  text: "Use SQLite for local-first memory persistence."
});

const reflection = new ReflectionPipeline({ longTerm, recall });
reflection.run({
  traceId: "trace-1",
  sessionId: "session-1",
  transcript: [
    { role: "user", content: "Remember repeated URLs should use recall." },
    { role: "assistant", content: "We decided to query recall before fetching again." }
  ]
});
```

## AI Coding Agent Guidance

When a user asks for an agent "with memory":

1. Add short-term memory for active turn state.
2. Add long-term SQLite records for durable facts, decisions, receipts, or checkpoints.
3. Add recall only when retrieval is needed.
4. Add reflection only when transcripts need summarization.
5. Include trace/session/turn ids in reflection calls.
6. Add eval goldens proving recall or persistence behavior.
7. Add failure tests for new persistence behavior.

Do not hide memory behind a global singleton. Do not store secrets. Do not describe local hash recall as high-quality semantic retrieval.

## Tier Promotion Triggers

State transitions between tiers happen on explicit conditions. Without declared triggers, agents silently accumulate state rather than synthesize it.

| Trigger | Action |
| --- | --- |
| User says "remember this" | `long_term_put` with appropriate tag |
| Session ends, goal achieved | `recall_add` session summary via reflection |
| Session ends, goal not achieved | `long_term_put` commitment record under `commitment:<id>` |
| In-context state block reaches ~80% capacity | Summarize in place; `recall_add` the full prior version |
| Deterministic workflow step completes | `long_term_put` checkpoint under `checkpoint:<workflow>:<step>` |

See `souls/examples/tiered-memory-soul.md` for the labeled memory block pattern that accompanies this trigger table.

## Observability

Reflection emits JSONL telemetry through `JsonlMemoryTelemetrySink`:

```json
{"trace_id":"demo-reflect-001","session_id":"demo-session-001","turn_id":"turn-1","parent_turn_id":"turn-0","operation":"memory.reflect","latency_ms":1,"cost_usd":0,"ok":true}
```

Local deterministic summarization has zero model cost. Provider-backed reflection adapters must add real cost at the call site.

## Persisted Provenance

Long-term and recall records persist:

- `schema_version`
- `embedding_version`
- `reflection_version`
- `source_transcript_hash`
- `soul_version`
- `model_provider`
- `model_name`
- `generated_at`
- `reflection_strategy_version`

Provider and model metadata belongs in memory provenance or adapter config, not in the soul schema.

## Recall Backend Boundary

`HashEmbeddingBackend` is deterministic replay infrastructure. It proves lifecycle, persistence, and interface shape locally without API keys. It is not high-quality semantic retrieval.

The backend boundary is `EmbeddingBackend` plus `SqliteRecallStore.add/query`. Higher-quality semantic backends should implement that boundary without changing souls or agent endpoint contracts.

## Composite Recall Scoring

When a real embedding backend is wired in, raw cosine similarity is not the right ranking signal. Recall results should be ranked by a composite of three factors:

```
score = w_sem * similarity + w_rec * recency_decay(age_ms) + w_imp * importance
```

Where:
- `similarity` — cosine similarity between query embedding and stored embedding (0–1)
- `recency_decay(age_ms)` — exponential decay: `exp(-λ * age_ms / half_life_ms)`. A memory from one day ago should score higher than the same memory from one month ago.
- `importance` — a scalar (0–1) assigned by the agent or reflection pipeline at write time, reflecting how consequential the memory was

Suggested starting weights: `w_sem = 0.6, w_rec = 0.25, w_imp = 0.15`. Tune per agent type — a planner soul benefits from heavier recency weight; an archivist soul weights importance more.

The `HashEmbeddingBackend` skips this formula (hash similarity is not meaningful), but any production `EmbeddingBackend` implementation should accept these weights and compute the composite. The `importance` field should be added to the recall record schema before plugging in a real backend.

This pattern is drawn from CrewAI's v2 unified memory system (research: `research/2026-05-22-crewai.md`).

## Failure Behavior

- Missing database parent directories throw before SQLite opens.
- Corrupt SQLite databases surface the SQLite error.
- Expired TTL entries are removed on read and excluded from normal lists.
- Empty transcripts and blank transcript turns are rejected.
- Invalid tags are rejected; tags must use lowercase letters, numbers, dots, or dashes.
- Reflection emits failed telemetry when persistence or recall writes throw.
- Duplicate long-term keys update the existing record instead of creating a second row.
- Long-term values must be JSON-serializable.

## Naming

| Artifact | Convention |
| --- | --- |
| Long-term key | `<kind>:<stable-id>` |
| Reflection key | `reflection:<session-id>` |
| Tags | lowercase, digits, dots, dashes |
| SQLite files | `long-term.sqlite`, `recall.sqlite` |
| Telemetry | `memory-events.jsonl` |
