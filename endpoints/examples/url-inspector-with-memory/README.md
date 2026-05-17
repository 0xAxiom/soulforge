# url-inspector-with-memory

Reference agent extending `endpoints/examples/url-inspector` with the Track 1 memory primitives.

It stays deliberately small:

- short-term memory keeps the current request URL in-process
- long-term memory persists inspection summaries in SQLite
- recall stores local hash embeddings in SQLite for deterministic replay lookup
- reflection is manually triggered from an example transcript

No model provider, cloud vector store, or hosted observability backend is required.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SOULFORGE_URL_MEMORY_DIR` | no | `~/.soulforge/url-inspector-with-memory` | Directory for SQLite databases and JSONL telemetry. |

## Run

From the repo root:

```bash
npm install
npm run url-inspector-memory:example
```

The demo prints:

- a first URL inspection
- a repeated inspection with historical recall
- a deterministic recall query
- a reflection summary persisted into long-term memory and recall

## Verify

```bash
npm run test -- endpoints/examples/url-inspector-with-memory
npm run typecheck
npm run lint
```

## Lifecycle Walkthrough

1. The caller submits a URL and HTML payload.
2. The agent writes the URL to short-term memory for the current turn.
3. Before inspection, the agent queries recall for similar prior URL summaries.
4. It extracts title, description, link count, and word count.
5. It persists the inspection in long-term SQLite with tags.
6. It writes a recall document for future semantic search.
7. A human can manually trigger reflection over a transcript; the resulting summary is persisted in long-term memory and recall.

## Transcript Example

```text
user: Inspect https://example.com and remember the metadata quality.
assistant: The page has a title, short description, one link, and a small body.
user: If I ask about metadata quality later, recall the historical result.
assistant: I will persist this inspection summary and add it to recall.
```

## Limits

The recall backend is a local deterministic hash embedder, not a hosted semantic model. It is replay infrastructure for proving lifecycle, persistence, and interface shape. It is not high-quality semantic retrieval.

Turbopuffer and pgvector are future semantic backends. The example intentionally calls only the `add/query` boundary so the backend can be swapped without turning SoulForge into a runtime.
