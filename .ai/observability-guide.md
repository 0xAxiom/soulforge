# Observability Guide

Every runtime path emits local JSONL events.

Event kinds:

- `cost`
- `latency`
- `error`
- `tool_call`
- `receipt`

Required correlation fields:

- `trace_id`
- `session_id` when available
- `turn_id` when available
- `parent_turn_id` when available

Default local path:

```text
~/.soulforge/obs/YYYY-MM-DD.jsonl
```

Use `observability/src/` primitives for cost ledgers, latency histograms, error grouping, and JSONL sinks.
