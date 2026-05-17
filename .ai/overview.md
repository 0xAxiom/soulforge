# SoulForge AI Overview

Read order for coding agents:

1. `README.md`
2. `CLAUDE.md`
3. `docs/ARCHITECTURE.md`
4. `.ai/repo-map.json`
5. `.ai/task-routing.md`
6. The nearest module `README.md`

SoulForge is not a runtime. It is a repo of copyable primitives and runnable reference patterns for agents.

Primary rule: agents should be easy to create, hard to create incorrectly.

Primary interface: a developer gives a natural-language instruction to an AI coding agent inside this repo.

When building a new agent:

1. Translate the instruction into primitives.
2. Read `.ai/task-routing.md`.
3. Inspect neighboring examples and module READMEs.
4. Implement explicit files with typed contracts, evals, observability, and docs.
5. Use the generator only if a scaffold speeds up the starting structure.

Optional accelerator:

```bash
npx soulforge new <agent-name> --template <template-name>
```

Generated agents are examples of the expected structure, not the primary product surface.

Do not add hidden orchestrators, provider-specific soul fields, untyped tool outputs, or live financial actions without caps and receipts.
