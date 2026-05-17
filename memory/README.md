# memory/

Memory primitives for SoulForge agents. These are copy-pasteable TypeScript modules, not a runtime package.

Track 1 vertical slice status: runnable and tested for short-term memory, long-term SQLite memory, local recall, and manual reflection.

## Modules

| Module | Path | Storage | Purpose |
| --- | --- | --- | --- |
| Short-term | `src/short-term.ts` | In-process `Map` | Per-session scratch state. |
| Long-term | `src/long-term.ts` | SQLite via `better-sqlite3` | Cross-session key/value memory with tags and optional TTL. |
| Recall | `src/recall.ts` | SQLite vectors + local hash embeddings | Deterministic semantic-ish lookup that runs locally. |
| Reflect | `src/reflect.ts` | Long-term + recall | Manual transcript summarization and persistence. |

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SOULFORGE_MEMORY_DIR` | no | `~/.soulforge/memory-demo` | Directory used by `npm run memory:example`. |

The primitives themselves accept explicit SQLite paths. They do not read env vars directly.

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
  tags: ["preference"]
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

The interface boundary is `EmbeddingBackend` plus `SqliteRecallStore.add/query`. A future turbopuffer adapter can replace both the vector persistence and embedding quality while leaving reference agents mostly unchanged.

See `research/2026-05-17-memory-backends.md` for the dependency and migration note.

## Observability

Reflection emits local JSONL telemetry through `JsonlMemoryTelemetrySink`:

```json
{"traceId":"demo-reflect-001","operation":"memory.reflect","latencyMs":1,"costUsd":0,"ok":true}
```

Cost is `0` for the local deterministic summarizer. Provider-backed reflection must set real model cost at the call site.

## Known Limits

- The local hash embedder is deterministic and cheap, but it is not a frontier semantic embedding model.
- Reflection is manual in v2 Track 1. No background lifecycle or automatic session-end hook is provided.
- Long-term values must be JSON-serializable.
