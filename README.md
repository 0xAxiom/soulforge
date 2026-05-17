<p align="center">
  <strong>SoulForge</strong>
</p>

<p align="center">
  <em>A forge for agents. Soul, tools, endpoints, memory, eval — composable, monetizable, deployable.</em>
</p>

---

## What this is

SoulForge is a workspace for building production AI agents. Unlike multi-product factories that handle websites, mobile apps, and dApps alongside agents, this repo only does agents — and tries to do them properly.

An agent here is the composition of five things:

| Primitive       | What it is                                                                  |
| --------------- | --------------------------------------------------------------------------- |
| **Soul**        | A versioned authoring of the agent's identity, voice, values, and limits.   |
| **Tools**       | Typed capabilities the agent can call (HTTP, x402, MCP, local).             |
| **Endpoints**   | The agent's outward surface — paid (`x402`), free, or webhook.              |
| **Memory**      | Short-term scratch, long-term recall, and embedding-backed retrieval.       |
| **Eval**        | Traces, scoring, and regression checks so changes ship without surprises.   |

These compose. You can author a soul without tools. You can ship an endpoint without memory. You can wire eval to any of the above. SoulForge does not enforce a stack — it provides the primitives and a shape for how they fit together.

---

## Repository layout

```
soulforge/
├── README.md                 ← you are here
├── CLAUDE.md                 ← constitution for agents building in this repo
├── docs/
│   └── ARCHITECTURE.md       ← how the five primitives compose
├── souls/                    ← soul schema + authored examples
├── endpoints/                ← endpoint templates + working demos
├── memory/                   ← memory primitives (v1: README + stubs)
├── eval/                     ← eval harness (v1: README + stubs)
├── observability/            ← tracing + cost tracking (v1: README + stubs)
└── research/                 ← notes from studying external frameworks and papers
```

The five primitive folders are mirrored on the same level intentionally — none of them is "the main thing." They are peers.

---

## What ships today (v1)

| Module            | Status                                                                  |
| ----------------- | ----------------------------------------------------------------------- |
| `souls/`          | JSON schema + one runnable example soul                                 |
| `endpoints/`      | `x402-endpoint` template + working URL-inspector demo deployed on Vercel |
| `docs/`           | Architecture write-up                                                   |
| `memory/`         | README only — directional, marked as v2 work                            |
| `eval/`           | README only — directional, marked as v2 work                            |
| `observability/`  | README only — directional, marked as v2 work                            |

Working demo of the endpoints module:

```
GET  https://x402-endpoint-demo.vercel.app/api/manifest
POST https://x402-endpoint-demo.vercel.app/api/inspect   ($0.01 USDC on Base)
```

---

## Why agents deserve a dedicated workspace

Multi-product workspaces collapse agents into one of many output shapes alongside mobile apps, websites, dApps, and plugins. That framing assumes "done" looks like a deliverable you ship and walk away from. Agents are not that. They run continuously, listen, learn, and earn. The whole repo is shaped around that assumption.

---

## Status

v1. Foundation. Things will change. The five-primitive shape is the bet — implementations under each are the iteration space.

License: MIT (planned — pending org call).
