# Anti-patterns

Never:

- Add a hidden runtime, global container, or dependency injection framework.
- Hardcode model providers into soul files.
- Return unstructured tool output.
- Skip eval goldens for new agent behavior.
- Skip observability for runtime paths.
- Move unrelated implementation into a giant shared abstraction.
- Add live financial execution without dry-run, caps, idempotency, and receipts.
- Use generated opaque soul formats.
- Add top-level implementation folders without updating `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, and `.ai/repo-map.json`.

Prefer:

- Local modules over global frameworks.
- Zod contracts over freeform JSON.
- JSONL traces over hidden dashboards.
- Copyable examples over package lock-in.
- Small tool modules over god-agents.
