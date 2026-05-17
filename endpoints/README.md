# endpoints/

The agent's outward surface. An endpoint is how callers — humans, agents, services — reach the agent's tools.

## Endpoint kinds

| Kind          | Auth model               | When to use                                                |
| ------------- | ------------------------ | ---------------------------------------------------------- |
| **x402**      | Per-call USDC payment    | Public, monetizable, discoverable on the Bazaar            |
| **API key**   | Bearer token             | Trusted callers, internal services                         |
| **Webhook**   | Signed payload           | Event-driven, called by another system                     |
| **Free**      | None                     | Discovery manifests, health checks, public read endpoints  |

v1 ships the **x402** template + a working demo. The other kinds are documented stubs.

## Templates (`templates/`)

| File                                    | Kind  | What it produces                                          |
| --------------------------------------- | ----- | --------------------------------------------------------- |
| [`x402-endpoint.md`](./templates/x402-endpoint.md) | x402  | Next.js app with `x402-next` middleware, manifest route, one paid route. |

## Examples (`examples/`)

| Directory                                            | Template       | Live URL                                       |
| ---------------------------------------------------- | -------------- | ---------------------------------------------- |
| [`url-inspector/`](./examples/url-inspector/README.md) | x402-endpoint  | https://x402-endpoint-demo.vercel.app          |

## Structural convention

Each endpoint module follows the same shape:

```
my-endpoint/
├── package.json
├── middleware.ts         ← payment / auth gating
├── app/
│   ├── api/
│   │   ├── manifest/     ← free discovery route
│   │   └── <tool>/       ← the paid/auth'd route
│   └── page.tsx          ← human-readable landing
└── README.md             ← curl invocation + deploy steps
```

The manifest route is the agent's machine-readable business card. Any endpoint a soul exposes should have one.

## What's not here yet (v2)

- `api-key.md` template
- `webhook.md` template
- A composition layer for endpoints that share auth + observability
- A registration helper for the Coinbase x402 Bazaar
