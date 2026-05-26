# A2A-Compatible Endpoint Template

**Category**: Agent-to-Agent Interoperability
**Primary use**: AI coding agents building soulforge endpoints that accept tasks from other AI agents via the Agent2Agent (A2A) protocol

---

## What This Template Covers

The [A2A Protocol](https://a2a-protocol.org) (adopted by 150+ orgs as of 2026) is the network-level standard for agent-to-agent task delegation. Any soulforge endpoint that exposes work to other agents — not just to humans — should be A2A-aware.

This template documents three things a soulforge endpoint needs to be A2A-compatible:

1. **Agent Card** at `GET /.well-known/agent.json` — machine-readable capability declaration
2. **Task endpoint** at `POST /api/a2a` — accepts JSON-RPC `message/send` and executes the task
3. **Manifest route alignment** — extend the existing `GET /api/manifest` to include A2A-compatible capability fields

A2A complements MCP, not replaces it. MCP gives your agent tools and context from services. A2A lets other agents call your agent as a service.

---

## When to Use

| Scenario | Use a2a | Use api-key instead |
|---|---|---|
| Caller is another AI agent (different framework/vendor) | ✓ | — |
| Multi-agent pipeline where this agent is a specialist | ✓ | — |
| Known human caller or internal service | — | ✓ |
| Payment-gated per-call work | Use x402 + expose Agent Card | — |
| Need to show up in agent discovery registries | ✓ | — |

---

## A2A Concepts Mapped to SoulForge

| A2A concept | SoulForge equivalent |
|---|---|
| `AgentCard` | manifest route + this template |
| `Task` | one endpoint invocation |
| `Artifact` | structured output (output_schema in soul frontmatter) |
| `contextId` | session_id in memory layer |
| `INPUT_REQUIRED` state | approval_required soul pattern |
| `skill` | one route's declared capability |
| `streaming` capability | SSE route variant |

---

## Agent Card Shape

The Agent Card is a free JSON endpoint. It declares your agent's identity and capabilities so other agents can discover and call it without reading documentation.

```typescript
// app/.well-known/agent.json/route.ts  (or app/api/agent-card/route.ts)
// No auth required — this is a public discovery document.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    id: process.env.AGENT_ID ?? "soulforge-<agent-name>",
    name: "<Human-readable agent name>",
    description: "<One sentence: what this agent does>",
    url: process.env.AGENT_BASE_URL ?? "https://<your-deployment>.vercel.app",
    version: "0.1.0",
    capabilities: {
      streaming: false,          // true if you expose SSE streaming
      pushNotifications: false,  // true if you accept webhook callbacks
    },
    skills: [
      {
        id: "<tool-name>",
        name: "<Tool display name>",
        description: "<What this skill does, one sentence>",
        inputModes: ["text"],    // "text" | "data" | "file"
        outputModes: ["data"],   // what Part types the artifact contains
        tags: ["<domain>"],
        examples: ["<example input prompt>"],
      }
    ],
    securitySchemes: {
      // For api-key protected endpoints:
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
        description: "Bearer <your-api-key>",
      },
      // For x402 payment-gated endpoints (no bearer key needed):
      // x402: { type: "x402", description: "Per-call USDC payment on Base" }
    },
    security: [{ apiKey: [] }],  // which scheme this agent requires
    defaultInputMode: "text",
    defaultOutputMode: "data",
  });
}
```

**Rules:**
- `url` must be the deployment base URL — clients use it to construct the task endpoint path.
- `skills` must match the actual routes your endpoint exposes. One skill per protected route.
- `capabilities.streaming` must be `true` only if you actually return SSE. Lying here breaks callers silently.

---

## Task Endpoint: JSON-RPC Shape

A2A callers send tasks as `message/send` JSON-RPC calls. The request body is `application/json`.

```typescript
// app/api/a2a/route.ts

import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

// ── A2A JSON-RPC Schemas ───────────────────────────────────────────────────

const PartSchema = z.object({
  kind: z.enum(["text", "data", "file"]),
  text: z.string().optional(),       // when kind === "text"
  data: z.record(z.unknown()).optional(), // when kind === "data"
});

const MessageSchema = z.object({
  messageId: z.string(),
  role: z.enum(["user", "agent"]),
  parts: z.array(PartSchema).min(1),
  contextId: z.string().optional(),   // conversation grouping
  taskId: z.string().optional(),      // which task this belongs to
  metadata: z.record(z.unknown()).optional(),
});

const SendMessageParamsSchema = z.object({
  message: MessageSchema,
  configuration: z.object({
    acceptedOutputModes: z.array(z.string()).optional(),
  }).optional(),
});

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.unknown(),
});

// ── Response Helpers ─────────────────────────────────────────────────────

function rpcSuccess(id: string | number, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: string | number | null, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

// ── Task States ──────────────────────────────────────────────────────────
// SUBMITTED → WORKING → COMPLETED | FAILED | INPUT_REQUIRED

// ── Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth: validate bearer token (same as api-key-endpoint.md middleware)
  // middleware.ts handles this before this handler runs.

  const body = await req.json().catch(() => null);
  const rpc = JsonRpcRequestSchema.safeParse(body);
  if (!rpc.success) {
    return rpcError(null, -32700, "Parse error");
  }

  if (rpc.data.method !== "message/send") {
    return rpcError(rpc.data.id, -32601, `Method not found: ${rpc.data.method}`);
  }

  const params = SendMessageParamsSchema.safeParse(rpc.data.params);
  if (!params.success) {
    return rpcError(rpc.data.id, -32602, "Invalid params");
  }

  const { message } = params.data;

  // Extract text input from the first text part
  const textPart = message.parts.find((p) => p.kind === "text");
  if (!textPart?.text) {
    return rpcError(rpc.data.id, -32602, "No text part in message");
  }

  const taskId = crypto.randomUUID();
  const contextId = message.contextId ?? crypto.randomUUID();

  try {
    // ── Execute the agent's actual work here ─────────────────────────────
    // For AI-backed work, call your soul-backed tool or generateObject/generateText.
    // For deterministic work, call your typed handler directly.
    const result = await runAgentTask(textPart.text);

    // Return A2A Task response with artifact
    return rpcSuccess(rpc.data.id, {
      id: taskId,
      contextId,
      status: { state: "completed" },
      artifacts: [
        {
          artifactId: crypto.randomUUID(),
          name: "result",
          parts: [
            {
              kind: "data",
              data: result,  // must match your output_schema
            }
          ],
        }
      ],
      metadata: {},
    });
  } catch (err) {
    return rpcSuccess(rpc.data.id, {
      id: taskId,
      contextId,
      status: {
        state: "failed",
        message: {
          messageId: crypto.randomUUID(),
          role: "agent",
          parts: [{ kind: "text", text: err instanceof Error ? err.message : "Task failed" }],
        },
      },
      artifacts: [],
    });
  }
}

async function runAgentTask(input: string): Promise<Record<string, unknown>> {
  // Replace with your actual agent logic.
  // Return a plain object matching your soul's output_schema.
  throw new Error("Not implemented — replace with soul-backed tool call");
}
```

---

## Manifest Route Alignment

Extend `GET /api/manifest` to include A2A-compatible fields so both soulforge-native and A2A callers can discover the endpoint:

```typescript
// app/api/manifest/route.ts — extended for A2A alignment

export async function GET() {
  return NextResponse.json({
    // Soulforge-native fields (unchanged)
    name: "<agent-name>",
    version: "0.1.0",
    auth: "api-key",
    routes: [/* ... your routes ... */],

    // A2A alignment: point to the Agent Card and task endpoint
    a2a: {
      agentCard: "/.well-known/agent.json",
      taskEndpoint: "/api/a2a",
      protocol: "a2a-v1",
    },
  });
}
```

---

## File Structure

```
outputs/<agent-name>/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── .env.example              # AGENT_BASE_URL, API_KEY, model keys
├── .gitignore
├── README.md
├── middleware.ts             # Bearer token validation (same as api-key template)
└── app/
    ├── layout.tsx
    ├── page.tsx
    └── api/
        ├── manifest/route.ts         # Soulforge manifest + a2a pointer
        ├── a2a/route.ts              # A2A task endpoint (JSON-RPC)
        └── .well-known/
            └── agent.json/route.ts   # A2A Agent Card (public)
```

---

## Testing A2A Compatibility

Verify the Agent Card is discoverable:

```bash
curl https://<your-deployment>.vercel.app/.well-known/agent.json
# → { "id": "...", "name": "...", "skills": [...], ... }
```

Send a test task via JSON-RPC:

```bash
curl -X POST https://<your-deployment>.vercel.app/api/a2a \
  -H "Authorization: Bearer <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test-1",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "msg-1",
        "role": "user",
        "parts": [{ "kind": "text", "text": "<your test prompt>" }]
      }
    }
  }'
# → { "jsonrpc": "2.0", "id": "test-1", "result": { "id": "...", "status": { "state": "completed" }, "artifacts": [...] } }
```

---

## What soulforge does NOT implement from A2A

| Feature | Why not |
|---|---|
| gRPC binding | Adds toolchain complexity (protoc, generated stubs); HTTP/JSON is sufficient for TypeScript web deployments |
| Push notification webhooks | Adds ops surface; use SSE or polling for long-running work; push belongs in a gateway layer |
| Cryptographic Agent Card signing | Over-engineered for dev/staging; document as available pattern, not default |
| `tasks/list` / `tasks/cancel` | Add only when task persistence and queue management are real requirements |
| Streaming SSE variant | Set `capabilities.streaming: true` and implement SSE only when callers require real-time updates |

---

## References

- A2A specification: https://a2a-protocol.org/latest/specification/
- A2A GitHub: https://github.com/a2aproject/A2A
- Soulforge A2A research note: `research/2026-05-25-a2a-protocol.md`
- api-key template (auth middleware): `endpoints/templates/api-key-endpoint.md`
- x402 template (payment): `endpoints/templates/x402-endpoint.md`
- Soulforge endpoint contracts: `endpoints/src/contracts.ts`
