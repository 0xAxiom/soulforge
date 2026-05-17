# Primitive Contracts

## Soul

- Input: markdown with validated frontmatter.
- Output: behavior policy for an implementation.
- Side effects: none.
- Failure: invalid frontmatter fails `npm run validate-souls`.

## Tool

- Input: Zod or TypeScript schema.
- Output: structured schema-validated object.
- Side effects: isolated to the tool.
- Failure: typed error plus observability event.

## Endpoint

- Input: HTTP or local request object.
- Output: structured response.
- Side effects: calls tools, writes traces, may receive payment.
- Failure: no tool execution before input/payment validation.

## Memory

- Input: typed records, transcripts, recall text.
- Output: JSON records and recall results.
- Side effects: local SQLite/Map writes.
- Failure: explicit errors for missing directories, corrupt DB, invalid tags.

## Eval

- Input: soul path plus goldens.
- Output: score table, traces, cache records.
- Side effects: local JSONL/cache writes.
- Failure: non-zero exit on regressions or invalid goldens.

## Observability

- Input: cost, latency, error, tool, or receipt events.
- Output: JSONL events.
- Side effects: local append-only files.
- Failure: surface sink write errors.
