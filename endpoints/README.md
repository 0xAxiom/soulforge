# endpoints/

Endpoint primitives define how humans, agents, services, and paid callers reach an agent. Endpoints are explicit boundaries: validate input, verify auth or payment, call typed tools, persist receipts, emit observability, and return structured output.

## Contract

| Concern | Required behavior |
| --- | --- |
| Inputs | Validate before tool execution. |
| Outputs | Return structured JSON or a typed local response. |
| Auth/payment | Verify before side effects. |
| Side effects | Declare and isolate tool calls, upstream fetches, posts, or financial actions. |
| Observability | Emit latency and errors; emit receipt events for paid routes. |
| Replay | Persist request metadata, receipts, and deterministic fixtures where possible. |
| Failure | Return useful errors without executing downstream work. |

## Modules

| Module | Path | Purpose |
| --- | --- | --- |
| Contracts | `src/contracts.ts` | Zod schemas for endpoint manifests, routes, traces, invocations, and x402 receipts. |
| x402 template | `templates/x402-endpoint.md` | Next.js + `x402-next` reference template. |
| URL inspector | `examples/url-inspector/` | Paid x402 endpoint example. |
| URL inspector with memory | `examples/url-inspector-with-memory/` | Local memory-backed endpoint reference. |

## Endpoint Kinds

| Kind | Auth model | Required guardrail |
| --- | --- | --- |
| `free` | none | no sensitive side effects |
| `x402` | per-call USDC payment | payment contract, receipt observability, no execution before payment |
| `api-key` | bearer token | key validation before side effects |
| `webhook` | signed payload | signature verification before side effects |

## Typed Contract Example

```ts
import { EndpointManifestContractSchema } from "./endpoints/src/index.js";

const manifest = EndpointManifestContractSchema.parse({
  name: "url-inspector",
  version: "0.1.0",
  description: "Paid URL metadata inspector.",
  routes: [
    {
      path: "/api/inspect",
      method: "POST",
      auth: "x402",
      description: "Inspect a URL after payment.",
      input_schema: { type: "object", properties: { url: { type: "string" } } },
      output_schema: { type: "object", properties: { title: { type: ["string", "null"] } } },
      side_effects: ["fetches upstream URL"],
      emits_observability: ["latency", "error", "receipt"],
      replay: {
        deterministic: false,
        receipt_required: true,
        notes: "Replay uses captured response fixtures and payment receipt metadata."
      },
      payment: {
        price_usd: "$0.01",
        network: "base",
        pay_to_env: "PAY_TO_ADDRESS"
      }
    }
  ],
  publisher: { name: "SoulForge" }
});
```

## Structural Convention

Endpoint examples use predictable names so AI coding agents can extend them reliably:

```text
<agent>/
├── README.md
├── .env.example
├── package.json
├── middleware.ts              payment/auth boundary when HTTP based
├── app/api/manifest/route.ts  free machine-readable discovery
├── app/api/<tool>/route.ts    paid/authenticated route
└── src/                       local tool/memory/eval code when not using Next routes
```

The manifest route is the agent's machine-readable business card. Any endpoint exposing paid or tool-backed behavior should have an equivalent manifest contract.

## AI Coding Agent Guidance

When a user asks for an endpoint:

1. Identify the auth/payment model.
2. Write or update the route contract first.
3. Validate request input before payment-independent work.
4. Verify payment/auth before tool execution.
5. Emit observability for success and failure.
6. Persist receipts for paid routes.
7. Add eval goldens for success and refusal/failure behavior.
8. Document env vars and local reproduction steps.

Do not create a route that calls tools before validation. Do not bury payment checks inside business logic. Do not return freeform JSON from tool-backed routes.

## Examples

| Directory | Demonstrates | Verify |
| --- | --- | --- |
| `examples/url-inspector/` | x402-paid metadata endpoint | `npm --prefix endpoints/examples/url-inspector run build` |
| `examples/url-inspector-with-memory/` | local endpoint logic with memory and reflection | `npm run test -- endpoints/examples/url-inspector-with-memory` |

## Verify

```bash
npm run test -- endpoints
npm run typecheck
npm run lint
```
