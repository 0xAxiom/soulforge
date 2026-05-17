# Reference Patterns

## Memory-backed agent

Use `memory/` for short-term state, SQLite long-term records, recall, and manual reflection. Store transcript summaries with provenance and trace ids.

## Paid x402 endpoint

Validate request first, verify x402/Base payment second, execute tool third, persist receipt fourth, emit observability last. Never run business logic before payment validation.

## Planner/executor split

Planner writes typed tasks. Executor performs bounded tool calls. Planner reviews output. Persist handoff records and score the full trace in eval.

## Economic action

Default to dry-run. Require live flag, network allowlist, spending cap, scoped wallet, idempotency key, receipt persistence, and telemetry.

## Generated agent

Generated agents own their local files. Do not import a SoulForge runtime. Copy primitives, adapt contracts, add tests and goldens.
