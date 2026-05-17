# Track 1 Memory Backends

## Decision

Use `better-sqlite3` for long-term persistence and a local deterministic hash embedding backend for the first recall slice.

## Why

`better-sqlite3` gives local-first persistence with no daemon, no network dependency, and Node >=20 support. That matches the Track 1 requirement for SQLite long-term memory and the repo invariant that major primitives must run on localhost.

The recall backend deliberately starts with local hash embeddings stored in SQLite. Turbopuffer is the recommended managed vector database candidate, but its official API requires bearer-token HTTP access and a remote namespace. Making it the first required backend would make the reference demo depend on cloud credentials, which conflicts with local-first operability.

## Alternatives Considered

Turbopuffer: official TypeScript package is `@turbopuffer/turbopuffer` and the HTTP API supports namespace writes and queries. Strong candidate for high-quality hosted recall after the local interface has stabilized. Tradeoff: API key, remote service, cost, rate limits, and data residency choices.

pgvector: strong SQL-native retrieval path for teams already running Postgres. Tradeoff: requires a local or managed Postgres service, which is heavier than SQLite for copy-pasteable examples.

Node built-in SQLite: avoids native dependency, but remains a newer platform surface and does not match the explicit Track 1 requirement for `better-sqlite3`.

## Interface Boundary

Recall code depends on:

- `EmbeddingBackend.embed(text): number[]`
- `SqliteRecallStore.add(document)`
- `SqliteRecallStore.query(text, options)`

A turbopuffer adapter should implement the same add/query shape and own remote namespace configuration outside the soul schema.

## Migration Concerns

The local hash backend is useful for tests and deterministic replay, not high-recall semantic search. Migrating to turbopuffer will require re-embedding stored recall documents into a turbopuffer namespace and recording the embedding backend name per namespace.

Do not put turbopuffer API keys, namespaces, or provider settings in soul frontmatter. Keep those in example env docs or adapter options.
