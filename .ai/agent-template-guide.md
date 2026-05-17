# Agent Template Guide

Templates are supporting scaffolds and executable examples. They are not the primary interface to SoulForge. The primary interface is a natural-language request to a coding agent that uses `.ai/`, docs, examples, and primitive contracts to create the right implementation.

Templates live in `generator/templates/<template-name>/template.json`.

Supported templates:

- `research-agent`
- `x402-paid-agent`
- `memory-agent`
- `planner-agent`
- `trading-agent`
- `watchdog-agent`

Optional command:

```bash
npx soulforge new my-agent --template research-agent
```

Generated structure:

```text
my-agent/
├── README.md
├── .env.example
├── package.json
├── soul.md
├── src/
│   ├── contracts.ts
│   ├── endpoint.ts
│   ├── tools.ts
│   ├── memory.ts
│   ├── observability.ts
│   ├── eval.ts
│   ├── index.ts
│   └── agent.test.ts
└── eval/goldens/
```

After generation, inspect the generated files, adapt the primitive contracts to the user's request, then run `npm install`, `npm run typecheck`, `npm run test`, and `npm run eval`.
