# SoulForge Generator

`soulforge new` is an optional accelerator for AI-assisted agent engineering. It creates copyable agent projects from explicit templates, but it is not the primary SoulForge product surface and it is not a runtime. The core workflow is a developer asking an AI coding agent to build an agent inside this repo; the generator exists to provide a smoke-tested starting structure when useful.

## Usage

```bash
npx soulforge new research-agent --template research-agent
npx soulforge new paid-research --template x402-paid-agent --out ./agents
```

## Templates

- `research-agent`
- `x402-paid-agent`
- `memory-agent`
- `planner-agent`
- `trading-agent`
- `watchdog-agent`

Each generated agent demonstrates the file structure AI coding agents should produce:

- `soul.md`
- `src/endpoint.ts`
- `src/tools.ts`
- `src/memory.ts`
- `src/observability.ts`
- `src/eval.ts`
- `src/contracts.ts`
- `eval/goldens/*.json`
- `src/agent.test.ts`
- `README.md`
- `.env.example`

Generated projects run independently with `npm install`, `npm run dev`, `npm run typecheck`, `npm run test`, and `npm run eval`.
