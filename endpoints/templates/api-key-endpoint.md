# API-Key Endpoint Template

**Category**: Authenticated Agent Service
**Primary use**: AI coding agents creating API-key-authenticated endpoints from natural-language requests

---

## Description

An endpoint secured by a static bearer token (`Authorization: Bearer <key>`). The key is validated before any side effects run. This template documents the structure AI coding agents should produce for a deployed HTTPS endpoint that:

1. Returns a free `GET /api/manifest` describing the service so other agents can discover it.
2. Returns `401 Unauthorized` on protected routes when no valid bearer token is present.
3. Validates request bodies with Zod before executing the handler.
4. Declares its full input and output schema up front — the schema IS the contract.
5. Emits observability events (latency, errors) on every call.

**Core architectural principle (from Magentic research 2026-05-24):** An endpoint is a typed function. The Zod input schema and output schema declared at the top of the route are the contract — not the README, not the handler comment. Everything downstream must match them.

---

## When to Use

| Scenario | Use api-key | Use x402 instead |
|---|---|---|
| Known callers (users, internal agents, trusted services) | ✓ | — |
| Per-call micropayments from anonymous callers | — | ✓ |
| Batch callers with rate limits | ✓ | — |
| Onchain settlement required | — | ✓ |
| Developer preview / internal tooling | ✓ | — |

---

## Pre-Configured Features

### Core Features

- Bearer-token middleware that validates before any handler logic runs
- Discovery endpoint at `GET /api/manifest` (free, no key required)
- One protected endpoint at `POST /api/<tool>` per template instance
- Zod input and output schema declared at the top of the route handler
- Typed error responses (400 bad input, 401 unauthorized, 500 internal)
- Observability: latency and error events emitted to JSONL via soulforge observability contract

### Two Modes

| Mode | Tool implementation | When to use |
|---|---|---|
| **Data** | Pure TS/JS handler (fetch, parse, transform) | Deterministic work, no LLM needed |
| **AI** | Vercel AI SDK (`generateObject`, `streamText`) | LLM-backed reasoning; include validation-retry on output |

The auth middleware and manifest route are identical across modes. The route handler is the only thing that changes.

---

## File Structure

```
outputs/<endpoint-name>/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── .env.example                   # API_KEY (generated secret), plus provider keys if AI mode
├── .gitignore
├── README.md
├── middleware.ts                  # Bearer token validation (THE wiring)
└── app/
    ├── layout.tsx
    ├── page.tsx                   # Human-readable landing page
    └── api/
        ├── manifest/route.ts      # Free discovery endpoint
        └── <tool>/route.ts        # Protected endpoint (Data or AI mode)
```

---

## Contract Pattern

Every route handler must open with its schema declarations, not bury them. This is the typed-function discipline:

```typescript
// app/api/<tool>/route.ts

import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

// ── Schemas (the contract — declared first, not inline) ────────────────────
const InputSchema = z.object({
  // declare all fields here with .describe() for manifest generation
  query: z.string().min(1).describe("The input to process"),
});

const OutputSchema = z.object({
  result: z.string().describe("The processed output"),
  model_used: z.string().optional().describe("Model that produced the result"),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// ── Handler ────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth is enforced by middleware.ts before this handler runs.
  // Validate input:
  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const input: Input = parsed.data;

  // ... handler logic ...

  const output: Output = { result: "...", model_used: "claude-sonnet-4-6" };

  // Validate output before returning (AI mode: retry up to 2× on schema failure)
  const outParsed = OutputSchema.safeParse(output);
  if (!outParsed.success) {
    // In AI mode: re-prompt with error; in data mode: this is a code bug
    return NextResponse.json({ error: "Output schema violation", detail: outParsed.error.flatten() }, { status: 500 });
  }

  return NextResponse.json(outParsed.data);
}
```

---

## Auth Middleware

```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/api/<tool>"];  // extend for more routes

export function middleware(req: NextRequest) {
  if (!PROTECTED.some((path) => req.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token || token !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
```

**Rule:** The key comparison must run before the handler. No handler logic executes on an unauthenticated request.

---

## Manifest Route

```typescript
// app/api/manifest/route.ts
// Free — no auth required. Describes the service for agent discovery.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: process.env.ENDPOINT_NAME ?? "<tool>",
    version: "0.1.0",
    auth: "api-key",
    routes: [
      {
        path: "/api/<tool>",
        method: "POST",
        description: "One sentence on what this route does.",
        input_schema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        output_schema: {
          type: "object",
          properties: {
            result: { type: "string" },
            model_used: { type: "string" },
          },
          required: ["result"],
        },
      },
    ],
  });
}
```

---

## Required Inputs (Phase 0)

| Input | Description | Example |
|---|---|---|
| Endpoint name | kebab-case slug | `doc-summarizer` |
| Tool description | One sentence on what the protected route does | `Summarize a document to ≤ 5 bullet points` |
| Mode | `data` or `ai` | `ai` |
| Input schema | Zod fields for request body | `{ doc: z.string().max(50000) }` |
| Output schema | Zod fields for response | `{ bullets: z.array(z.string()).max(5) }` |
| Model (AI mode) | Which model backs the route | `claude-haiku-4-5-20251001` |

---

## Deploy Story

```bash
npm install
cp .env.example .env.local
# Generate and set API_KEY:
echo "API_KEY=$(openssl rand -hex 32)" >> .env.local
# Set model provider key if AI mode

npm run build           # type-check + bundle
vercel deploy --prod    # → live HTTPS URL

# Share the API_KEY with authorized callers out-of-band (never in the manifest)
```

---

## Observability Requirements

Every protected call must emit at minimum:

```jsonl
{"event":"endpoint.call","route":"/api/<tool>","latency_ms":234,"status":200,"session_id":"...","ts":"..."}
{"event":"endpoint.error","route":"/api/<tool>","error":"Output schema violation","status":500,"ts":"..."}
```

Use `observability/src/emit.ts` if available in the target project. Never swallow errors silently.

---

## Validation-Retry in AI Mode

When the LLM returns an output that fails the `OutputSchema`, the handler must retry before surfacing a 500:

1. Inject the Zod error into the next prompt: `"Previous output was invalid: [error]. Return a corrected response."`
2. Max 2 retries. On third failure, return 500 with the last best-effort output and the validation error.
3. Log each retry attempt as an observability event: `{"event":"endpoint.retry","attempt":1,"error":"..."}`.

This is the Magentic validation-retry discipline applied to HTTP endpoints. The schema is the contract; the contract failing is recoverable, not terminal.

---

## Quality Expectations

Generated endpoints must:

1. Reject unauthenticated requests with 401 before any handler logic runs
2. Declare input and output schemas at the top of the route file, not inline
3. Validate request body with Zod and return 400 on bad input
4. Validate output before returning (AI mode: retry; data mode: treat as bug)
5. Expose `GET /api/manifest` without auth
6. Emit observability events for each call (latency + errors minimum)
7. Type-check cleanly under `tsc --noEmit`
8. Build cleanly under `next build`
9. Include a README with the curl invocation and key provisioning instructions

---

## References

- Magentic typed-function pattern: https://magentic.dev/ (schema-first, typed return = contract)
- soulforge observability: `observability/src/emit.ts`
- soulforge endpoint contracts: `endpoints/src/contracts.ts`
- x402 template (for payment-gated variant): `endpoints/templates/x402-endpoint.md`
- Zod: https://zod.dev
- Vercel AI SDK: https://sdk.vercel.ai
