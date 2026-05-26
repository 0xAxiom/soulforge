# SoulForge MCP Specification

> **Status:** Draft — v0.1 | **Author:** Axiom | **Date:** 2026-05-25

An MCP server exposing SoulForge primitives so external agents can introspect, query, and evaluate other agents without owning their codebase.

---

## Why MCP

SoulForge primitives (`soul / memory / eval`) are designed for the *building* phase — developers reading markdown, running evals, inspecting SQLite. MCP extends them to the *runtime* phase: an agent in production calling another agent's soul-state endpoint to understand who it is, reading its memory to pick up context, or running a quick evaluation pass before trusting a response.

The bet: **primitives-over-framework applies to the network layer too.** An MCP server is 30 lines and no runtime dependency. It is not a SoulForge SDK.

---

## Server Identity

```json
{
  "name": "soulforge",
  "version": "0.1.0",
  "description": "Introspect, recall, and evaluate SoulForge agents via MCP."
}
```

---

## Exposed Capabilities

### Tools (callable functions)

#### `soul_state`

Returns the current soul's parsed frontmatter and full markdown body. Read-only.

```typescript
// Input
interface SoulStateInput {
  soul_path?: string;  // relative to souls/; default: "examples/starter-soul.md"
}

// Output
interface SoulStateOutput {
  name: string;
  version: string;
  model_hint?: string;
  capabilities: string[];
  refusals: string[];
  voice_notes?: string;
  raw_markdown: string;
}
```

Use case: an orchestrating agent checks a worker agent's refusal list before delegating a task.

---

#### `memory_recall`

Semantic recall from the agent's long-term memory store. Returns top-k records by cosine similarity.

```typescript
// Input
interface MemoryRecallInput {
  query: string;
  k?: number;           // default: 5, max: 20
  filter_tags?: string[];
}

// Output
interface MemoryRecallOutput {
  records: Array<{
    id: string;
    content: string;
    tags: string[];
    created_at: string;
    similarity: number;
  }>;
  total_searched: number;
}
```

Use case: a multi-agent coordinator surfaces prior context before a meeting-note agent summarizes a new conversation.

---

#### `memory_write`

Writes a record to long-term memory. Requires explicit caller authorization in the soul's `allowed_callers` field (see §Security).

```typescript
// Input
interface MemoryWriteInput {
  content: string;
  tags?: string[];
  ttl_days?: number;  // omit for permanent
  caller_id: string;  // verified against soul's allowed_callers
}

// Output
interface MemoryWriteOutput {
  record_id: string;
  created_at: string;
}
```

---

#### `eval_run`

Runs a named golden set against the current soul and returns scores. Lightweight — uses the content-addressed cache first.

```typescript
// Input
interface EvalRunInput {
  soul_path?: string;
  golden_set?: string;  // folder name under eval/goldens/; default: matches soul name
  max_goldens?: number; // default: all; set low for quick checks
}

// Output
interface EvalRunOutput {
  soul_version: string;
  golden_set: string;
  scores: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
  };
  failures: Array<{
    golden_id: string;
    expected: string;
    actual: string;
    scorer: "exact" | "semantic" | "judge";
  }>;
  cache_hits: number;
  cost_usd: number;
}
```

Use case: a CI agent calls `eval_run` on a modified soul before merging, without spinning up a full test runner.

---

### Resources (readable state)

| URI | Content | Description |
|-----|---------|-------------|
| `soulforge://souls/{name}` | Markdown | Raw soul file by name |
| `soulforge://memory/recent?limit=N` | JSON array | Most recent N memory records |
| `soulforge://eval/last-run` | JSON | Results of most recent eval run |
| `soulforge://observability/cost?since=7d` | JSON | Cost ledger for last N days |

---

### Prompts (templates)

#### `soulforge_intro`

Returns a condensed description of the agent (name, capabilities, refusals) formatted as a natural-language introduction. Useful when one agent needs to explain another agent's profile to a user.

Input: `soul_path?`  
Output: Plain text, ≤200 words.

---

## Security Model

**Default: read-only, local.** The MCP server binds to `localhost:PORT` and requires no auth for `soul_state`, `memory_recall`, `eval_run`, and all resources.

**Memory writes require caller authorization.** The soul file must include an `allowed_callers` list in frontmatter:

```yaml
allowed_callers:
  - "orchestrator-agent"
  - "0xYourWalletAddress"  # Base-signed identity
```

Caller ID is passed in the tool input and checked before any write. No match = hard rejection, not silent failure.

**Remote deployment:** wrap with a reverse proxy that checks a shared secret header. The MCP server itself does not implement network auth — that layer belongs to the deployment, not the primitive.

---

## Reference Implementation

```
endpoints/examples/soulforge-mcp-server/
├── README.md       ← setup + usage
├── server.ts       ← MCP server entrypoint (≤150 lines)
├── handlers/
│   ├── soul.ts
│   ├── memory.ts
│   └── eval.ts
└── __tests__/
    └── handlers.test.ts
```

Server uses [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). No SoulForge-specific runtime dependency. Copy the folder to any project and it works.

---

## Versioning

Soul versions, memory schema versions, and eval golden set versions are tracked independently. The MCP server version tracks the server spec only. Breaking changes (removed tools, changed input schemas) increment the major version and are announced in `CHANGELOG.md`.

---

## Out of Scope

- Agent-to-agent message passing (use Net Protocol / botchan)
- Real-time event streaming (use observability JSONL + a watcher)
- Cross-chain identity (Base-native only, per Soulforge v2 scope)
- Auth management (deploy-layer concern, not MCP server concern)
