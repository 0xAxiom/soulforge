# AI Architecture Notes

Implementation primitives:

- `souls/`: markdown-first behavior contracts.
- `tools/`: optional typed capability modules.
- `endpoints/`: outward API surfaces and examples.
- `memory/`: local short-term, long-term, recall, and reflection primitives.
- `eval/`: JSONL traces, goldens, scoring, diff, and cache.
- `observability/`: local JSONL cost, latency, error, tool, and receipt events.

Repo meta-layers:

- `.ai/`: machine-readable guidance for natural-language implementation.
- `generator/`: optional scaffold templates and structure examples.
- `docs/`: architecture and release docs.
- `research/`: implementation research notes.

Natural-language composition order:

```text
user request -> primitive routing -> neighboring examples -> soul policy -> typed tools -> memory -> endpoint -> eval -> observability
```

Financial composition:

```text
soul policy -> typed economic tool -> payment/cap boundary -> Base/Bankr -> receipt -> obs/eval/memory
```
