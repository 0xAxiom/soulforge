# memory/

Memory primitives for SoulForge agents. These are copy-pasteable TypeScript modules, not a runtime package.

Track 1 vertical slice status: runnable and tested for short-term memory, long-term SQLite memory, local recall, and manual reflection.

## Modules

| Module | Path | Storage | Purpose |
| --- | --- | --- | --- |
| Short-term | `src/short-term.ts` | In-process `Map` | Per-session scratch state. |
| Long-term | `src/long-term.ts` | SQLite via `better-sqlite3` | Cross-session key/value memory with tags, optional TTL, and provenance metadata. |
| Recall | `src/recall.ts` | SQLite vectors + local hash embeddings | Deterministic replay retrieval that runs locally. |
| Reflect | `src/reflect.ts` | Long-term + recall | Manual transcript summarization and persistence. |

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SOULFORGE_MEMORY_DIR` | no | `~/.soulforge/memory-demo` | Directory used by `npm run memory:example`. |

The primitives themselves accept explicit SQLite paths. They do not read env vars directly.

Examples create their data directories before opening SQLite. The primitives fail fast if the parent directory is missing so callers do not silently create memory in the wrong place.

## Run

From the repo root:

```bash
npm install
npm run memory:example
```

The example writes:

- `long-term.sqlite`
- `recall.sqlite`
- `memory-events.jsonl`

under `SOULFORGE_MEMORY_DIR` or `~/.soulforge/memory-demo`.

## Verify

```bash
npm run test -- memory
npm run typecheck
npm run lint
```

## API Sketch

```ts
import {
  LongTermMemoryStore,
  ReflectionPipeline,
  ShortTermMemory,
  SqliteRecallStore
} from "./memory/src/index.js";

const shortTerm = new ShortTermMemory<string>();
shortTerm.set("current-url", "https://example.com");

const longTerm = new LongTermMemoryStore("./memory.sqlite");
longTerm.put({
  key: "preference:tone",
  value: { tone: "terse" },
  tags: ["preference"],
  provenance: {
    soul_version: "starter@0.1.0"
  }
});

const recall = new SqliteRecallStore("./recall.sqlite");
recall.add({
  id: "decision-1",
  text: "Use SQLite for local-first memory persistence."
});

const reflection = new ReflectionPipeline({ longTerm, recall });
reflection.run({
  sessionId: "session-1",
  transcript: [
    { role: "user", content: "Remember that repeated URLs should use recall." },
    { role: "assistant", content: "We decided to query recall before fetching again." }
  ]
});
```

## Recall Backend Rationale

The first recall backend is `HashEmbeddingBackend`, a deterministic local embedder persisted by `SqliteRecallStore`. It is intentionally modest. It proves the lifecycle locally without API keys or managed infrastructure.

Important: local hash recall is deterministic replay infrastructure. It is not high-quality semantic retrieval and should not be described as production semantic memory. Turbopuffer and pgvector are future semantic backends.

The interface boundary is `EmbeddingBackend` plus `SqliteRecallStore.add/query`. It must remain backend-swappable. A future turbopuffer adapter can replace both the vector persistence and embedding quality while leaving reference agents mostly unchanged.

See `research/2026-05-17-memory-backends.md` for the dependency and migration note.

## Observability

Reflection emits local JSONL telemetry through `JsonlMemoryTelemetrySink` with correlation fields:

```json
{"trace_id":"demo-reflect-001","session_id":"demo-session-001","turn_id":"turn-1","parent_turn_id":"turn-0","operation":"memory.reflect","latency_ms":1,"cost_usd":0,"ok":true}
```

Cost is `0` for the local deterministic summarizer. Provider-backed reflection must set real model cost at the call site.

## Persisted Provenance

Long-term and recall records persist provenance fields:

- `schema_version`
- `embedding_version`
- `reflection_version`
- `source_transcript_hash`
- `soul_version`
- `model_provider`
- `model_name`
- `generated_at`
- `reflection_strategy_version`

Reflection computes `source_transcript_hash` as a SHA-256 hash of the transcript JSON. Provider and model fields belong in memory provenance or adapter config, not in soul schema.

## Failure Behavior

- Missing database parent directories throw before SQLite opens.
- Corrupt SQLite databases surface the SQLite error instead of being swallowed.
- Expired TTL entries are removed on read and excluded from normal lists.
- Empty transcripts and blank transcript turns are rejected.
- Invalid tags are rejected; tags must use lowercase letters, numbers, dots, or dashes.
- Reflection emits a failed telemetry record when persistence or recall writes throw.
- Duplicate long-term keys update the existing record instead of creating a second row.

## Known Limits

- The local hash embedder is deterministic and cheap, but it is not a frontier semantic embedding model.
- Turbopuffer and pgvector are the intended future semantic recall backends once the adapter boundary has more production evidence.
- Reflection is manual in v2 Track 1. No background lifecycle or automatic session-end hook is provided.
- Long-term values must be JSON-serializable.
