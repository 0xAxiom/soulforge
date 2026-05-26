# soulforge-mcp-server

A reference MCP server that exposes SoulForge primitives to external agents.

> See [`docs/MCP.md`](../../../../docs/MCP.md) for the full spec.

---

## What it exposes

| Kind | Name | Description |
|------|------|-------------|
| Tool | `soul_state` | Parsed frontmatter + markdown body for any soul |
| Tool | `memory_recall` | Semantic recall from the agent's long-term memory |
| Tool | `memory_write` | Write a record to long-term memory |
| Tool | `eval_run` | Run goldens against a soul, return scores |
| Resource | `soulforge://souls/{name}` | Raw soul markdown by filename |
| Resource | `soulforge://memory/recent?limit=N` | Most recent N memory records |
| Prompt | `soulforge_intro` | ≤200-word plain-text agent introduction |

---

## Quick start

```bash
# From the soulforge repo root
npm install
npx tsx endpoints/examples/soulforge-mcp-server/server.ts
```

The server listens on **stdio** by default — paste it into an MCP client config:

```json
{
  "mcpServers": {
    "soulforge": {
      "command": "npx",
      "args": ["tsx", "endpoints/examples/soulforge-mcp-server/server.ts"],
      "cwd": "/path/to/soulforge"
    }
  }
}
```

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SOULFORGE_MEMORY_DIR` | `~/.soulforge/mcp` | Where SQLite memory files are stored |
| `SOULFORGE_ALLOWED_CALLERS` | *(empty — open writes)* | Comma-separated list of caller IDs allowed to call `memory_write`. Empty = open. |

---

## Security

- `soul_state`, `memory_recall`, `eval_run`, and all resources are **read-only and open** — no auth required for local use.
- `memory_write` checks `SOULFORGE_ALLOWED_CALLERS` (or the soul's `allowed_callers` field if you integrate it). Empty = any caller can write.
- The server binds to **stdio only** — not a network socket. For remote use, wrap with a reverse proxy that enforces a shared secret header.

---

## Verification

```bash
npm run test -- soulforge-mcp-server
npm run typecheck
```

---

## Structure

```
soulforge-mcp-server/
├── README.md            ← this file
├── server.ts            ← MCP server entrypoint (≤150 lines)
├── handlers/
│   ├── soul.ts          ← soul_state, soulIntro, rawSoul, listSouls
│   ├── memory.ts        ← memory_recall, memory_write, recentMemory
│   └── eval.ts          ← eval_run
└── __tests__/
    └── handlers.test.ts ← unit tests for all handlers
```
