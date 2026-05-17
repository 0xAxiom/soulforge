# Agentic Repo Patterns for SoulForge v2/v3

## Sources Reviewed

- NousResearch/hermes-agent README and security policy: https://github.com/NousResearch/hermes-agent
- elizaOS/eliza README and public documentation: https://github.com/elizaOS/eliza and https://docs.elizaos.ai
- Coinbase AgentKit repository and package notes: https://github.com/coinbase/agentkit and https://www.coinbase.com/agentkit
- Base Account SDK docs for Base Account, Base Pay, Spend Permissions, and Sub Accounts: https://docs.base.org/base-account/reference/core/createBaseAccount and https://docs.base.org/identity/smart-wallet/guides/sub-accounts
- x402 protocol docs and Cloudflare agentic payments docs: https://docs.cdp.coinbase.com/x402/docs/welcome and https://developers.cloudflare.com/agents/x402/
- OpenAI Agents SDK tracing docs, Anthropic computer-use and MCP docs, and recent public research/analysis on MCP risk: https://openai.github.io/openai-agents-python/tracing/, https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool, and https://docs.anthropic.com/en/docs/mcp

## What to Borrow

Hermes has the strongest evidence loop: persistent memory, session search, skill creation from experience, scheduled automations, gateways across messaging surfaces, and explicit command approval. SoulForge should borrow the loop shape: traces and failures become human-readable improvement artifacts. Keep the output as markdown souls, goldens, JSONL traces, and copyable examples.

Eliza is strongest on social-agent ergonomics: character configuration, plugins, rooms/worlds for context partitioning, action chaining, CLI scaffolding, and runnable examples. SoulForge should borrow the reference-example density and typed coordination records. Rooms/worlds map well to future primitive-level session/channel IDs, but not to a mandatory runtime.

Base and Coinbase provide the economic substrate: AgentKit action providers, Base Account sign-in, Base Pay USDC payments, Spend Permissions, Sub Accounts, and x402. SoulForge should borrow dry-run-first tool modules, spending caps, network allowlists, receipts, and Base Sepolia reproduction paths.

x402 should become the paid endpoint and paid tool-call pattern: request, receive HTTP 402 payment requirements, pay with a capped client, retry with proof, persist a receipt. MCP/x402 services are useful, but SoulForge should represent them as examples and typed client primitives, not as a required bus.

Current frontier agent work converges on long-horizon state, memory reflection, eval-driven improvement, structured tool contracts, multi-agent handoffs, browser/computer-use isolation, and verifiable receipts. SoulForge should implement these as independent reference agents and primitives.

## What Not to Borrow

Do not copy Hermes as a personal-agent runtime. Its gateway process, terminal backends, whole-agent configuration, and skill lifecycle are useful to study but too load-bearing for SoulForge’s primitive-first thesis.

Do not copy Eliza’s framework split. Eliza explicitly centers `@elizaos/core`, an AgentRuntime, plugin loading, app shells, and Bun/Node v24 assumptions. SoulForge must stay npm + Node >=20 with copyable modules.

Do not import AgentKit wholesale as a hidden dependency behind every agent. Use official SDKs in tool modules where needed, but expose small typed functions with mocks, dry-run defaults, and explicit env docs.

Do not make x402 multichain in v2. Public x402 docs list many networks, but this repo’s contract says Base-only for v2.

Do not treat MCP servers, browser agents, or computer-use agents as trusted just because they have a protocol. Tool discovery is not a security boundary.

## Conflicts With SoulForge Philosophy

Central runtimes conflict with “primitives + working examples.” Plugin registries conflict when they hide code execution behind a package name. Web dashboards conflict with the no-SoulForge-UI constraint. Auto-generated soul edits conflict with human-authored souls. Hosted vector stores conflict when they become required for local operation. Model-provider-specific memory or eval fields conflict with provider-agnostic souls.

## v2 Scope

- Harden memory provenance and deterministic replay metadata.
- Build eval as JSONL traces, hand-curated goldens, cache, score, and diff.
- Build local-first observability with JSONL cost, latency, and errors.
- Add Base-native `tools/` modules with dry-run defaults and integration tests gated by env.
- Add x402 client/server examples with receipt capture and spending caps.
- Add structured output contracts with Zod at every new tool boundary.

## v3 Scope

- High-quality semantic recall adapters for turbopuffer and pgvector.
- Long-horizon background agents with scheduling, checkpoints, and duplicate-action prevention.
- Human-approved self-improvement loops that suggest soul diffs.
- Multi-agent transport beyond in-process channels, possibly Net Protocol, A2A, or x402-paid agent-to-agent calls.
- Browser/computer-use agents in isolated sandboxes.
- Verifiable execution and receipt-backed claims, including TEE research once the trust boundary is concrete.

## Dependency Risks

`better-sqlite3` is native and can fail on unsupported Node/OS combinations. Keep it isolated and tested under Node >=20.

`@base-org/account`, `@coinbase/agentkit`, x402 packages, Farcaster clients, and Bankr APIs may change quickly. Tool modules should wrap narrow surfaces, pin versions, and include mocked tests.

Eliza uses Bun and Node v24+ in places; it should inform patterns, not become a dependency.

Turbopuffer requires API-key HTTP access. It is a future adapter, not the required local recall backend.

MCP/x402/browser automation tools can pull large transitive dependency trees. Keep integrations optional and examples explicit.

## Security Risks

Money-moving tools can lose funds. Every path must default to dry-run, require an explicit live flag, enforce network allowlists, cap spend, record receipts, and use idempotency keys.

Social-posting tools can spam or reputationally harm users. Default to preview/dry-run and require explicit live mode.

Background agents can duplicate actions after crashes. Persist checkpoints and idempotency keys before side effects.

Memory and traces can capture PII or secrets. Store local-first by default, document paths, and add redaction before cloud adapters.

MCP and plugin ecosystems are not security boundaries. Do not execute discovered tools without explicit configuration and review.

x402 introduces paid-but-denied and unpaid-service edge cases if receipt handling is incomplete. Clients must persist payment attempt metadata and servers must return settlement confirmation when available.

## Licensing Concerns

SoulForge is MIT. Hermes and Eliza are MIT-compatible for learning patterns, but code should not be copied. Coinbase AgentKit is Apache-2.0; depending on its packages is acceptable with notice discipline, but avoid vendoring code. Official Base docs and x402 docs should inform adapters, not be reproduced wholesale.

## Implementation Recommendations

1. Keep Track 1.5 focused on provenance, correlation IDs, and failure behavior. Do not add new memory features.
2. In Track 2, make eval runnable without a model by supporting hard assertions and exact/semantic scorers first. Put LLM-as-judge behind an explicit provider adapter.
3. In Track 3, use JSONL sinks that mirror eval trace IDs so examples can be debugged locally with `tail` and small CLIs.
4. In Track 4, put all Base-native capabilities under `tools/`, one module per capability, with Zod schemas and dry-run examples.
5. In Track 5, prefer in-process coordination and explicit handoff records before any networked multi-agent protocol.
6. In Track 6, generate copyable agents, not a SoulForge app. Generated projects should contain the primitives they need.
