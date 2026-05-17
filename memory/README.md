# memory/

> **v1 placeholder.** No runnable code in this folder yet. This README is the design intent. v2 will land the actual primitives.

Agent memory has three different lifecycles. Treating them as one (just "the vector store") is the most common modeling error in agent systems. SoulForge separates them on purpose.

## The three lifecycles

| Lifecycle    | Lifetime           | Storage shape           | Read pattern                  | Example                                       |
| ------------ | ------------------ | ----------------------- | ----------------------------- | --------------------------------------------- |
| Short-term   | Single conversation| In-process KV           | Read every turn               | "User just told me their name"               |
| Long-term    | Cross-conversation | SQLite or KV w/ TTL     | Read at session start         | "This user prefers terse responses"           |
| Recall       | Permanent          | Embedding store         | Read by semantic relevance    | "What did we decide about the API design?"   |

## Planned primitives (v2)

```
memory/
├── short-term/        ← Map-based session store with a simple API
├── long-term/         ← SQLite adapter with key/value + tags
├── recall/            ← turbopuffer or pgvector adapter
└── reflect/           ← Session-end summary → long-term + recall write
```

Each module will ship as a small, independent library you can copy into an agent's repo. No central runtime.

## Open design questions

1. **Recall provider.** turbopuffer (managed, cheap, simple API) vs pgvector (self-hosted, full SQL, more ops). Probably both; user picks.
2. **Reflection trigger.** Session end, time-based, message-count-based, or a separate cron? The trigger affects what gets remembered.
3. **Memory eviction.** Long-term storage grows forever without it. Manual? LRU? Relevance-based? TBD when we have a real agent producing real memory volume.
4. **Soul-driven memory rules.** Should the soul declare what to remember? Or is that a separate config?

## Why this is a stub today

Building memory primitives without a real agent to test them against produces shelfware. The plan: ship one agent end-to-end using souls + endpoints, then design memory based on what that agent actually needed.
