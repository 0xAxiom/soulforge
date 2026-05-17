# Memory Guide

Memory has four layers:

- Short-term: in-process Map KV.
- Long-term: SQLite records with tags and TTL.
- Recall: SQLite deterministic local hash embeddings.
- Reflect: manual transcript summarization into long-term and recall.

Rules:

- Keep local-first operation.
- Preserve provenance fields.
- Include `trace_id`, `session_id`, `turn_id`, and `parent_turn_id` when available.
- Treat local hash recall as deterministic replay infrastructure, not high-quality semantic retrieval.
- Validate tags.
- Add failure-state tests for persistence changes.
