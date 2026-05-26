# Claude Agent SDK

**Target** — Anthropic's Claude Agent SDK (Python + TypeScript): [docs](https://code.claude.com/docs/en/agent-sdk/overview) · [Python SDK](https://github.com/anthropics/claude-agent-sdk-python) · [TypeScript SDK](https://github.com/anthropics/claude-agent-sdk-typescript) · [engineering blog](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)

## What it is

The Claude Agent SDK packages the exact agent loop, tools, context management, and session infrastructure that powers Claude Code as an importable Python/TypeScript library. You call `query()`, pass a prompt and an `options` object, and iterate over a stream of typed messages; Claude handles all tool dispatch internally. It is the same runtime used in this very cron session.

The SDK was renamed from "Claude Code SDK" in 2025 to reflect that its patterns generalize beyond coding. Starting June 2026, SDK usage on subscription plans draws from a separate monthly credit pool, indicating Anthropic is treating it as a distinct surface.

## Architecture

- **Exposed agent loop, not abstracted.** The core design decision is that the model-decide-next-step loop is surfaced to the developer as a message stream, not hidden behind a chain or pipeline abstraction. You see every assistant turn, tool use, and result as typed events. This is the opposite of LangGraph's graph-runtime model.

- **Subagents via tool call, not graph edges.** Subagents are invoked through an `Agent` tool in Claude's tool set. Parent defines subagents via an `agents` dict keyed by name; each entry has a `description` field that Claude uses to decide *when* to invoke it. The orchestration decision is a model judgment call — no explicit routing rules.

- **Context isolation as first-class invariant.** Each subagent starts with a *fresh* context window. It receives only its `AgentDefinition.prompt` and the explicit string passed as the Agent tool's input — not the parent's conversation history, not previously loaded files. Only the subagent's final message returns to the parent. This is the primary mechanism for managing context overflow in long-horizon tasks.

- **No sub-subagents.** Subagents cannot spawn their own subagents (`Agent` must be absent from their `tools`). This enforces a flat two-level hierarchy and avoids unbounded delegation trees. An explicit design choice, not a limitation waiting to be lifted.

- **Hooks over middleware classes.** Lifecycle interception uses named hook points (`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`) with callback functions, not middleware class hierarchies. Hooks receive typed inputs, can block (pre-call) or observe (post-call), and return structured results. This maps directly to soulforge's execution filter pattern.

- **Sessions backed by JSONL, resumable.** Every session produces append-only JSONL on the filesystem. Sessions can be resumed by ID; the agent picks up with full prior context. Subagent transcripts persist independently of the parent transcript. Default cleanup is 30 days.

- **Five-layer context compaction.** Long sessions are managed by a five-layer compaction pipeline that runs when context approaches the model's window limit. The developer does not control compaction timing — it fires automatically. Subagent transcripts are unaffected when the parent compacts.

- **Permission modes + ML classifier.** Seven permission modes control tool approval granularity, from `dontAsk` (auto-approve all) to `default` (prompt on sensitive tools). An ML-based classifier determines which tools are "sensitive" — this is not a simple allowlist comparison.

- **Managed Agents as cloud counterpart.** Anthropic offers a hosted REST API version (Managed Agents) where Anthropic runs the sandbox. The SDK is self-hosted; Managed Agents is the same capability without the infrastructure burden. Common pattern: prototype with SDK, promote to Managed Agents for production.

## What soulforge can learn

- **Context isolation = the minimal briefing norm, enforced by substrate.** The SDK doesn't just recommend passing minimal context to subagents — it makes passing full parent history *impossible*. Soulforge's `handoff-router-soul.md` says "summarize to facts the specialist needs" as a policy; this should be treated as a hard architectural invariant, not a recommendation. The architecture doc should name it explicitly: **the minimal briefing is a correctness requirement, not a style preference**.

- **Description-driven dispatch is cleaner than pre-wired routing.** The SDK routes to subagents based on the `description` field at call time — the model decides. This is a different pattern from soulforge's `handoff-router` (explicit routing + classification) and `workflow-orchestrator` (pre-planned stages). There's a third shape: fan-out to parallel context-isolated subagents based on descriptions, collecting only final results. This is the `context-isolated-fanout` soul gap in soulforge's example library.

- **`maxTurns` = `loop_stop: [step_count:N]` in soulforge terms.** The SDK's `maxTurns` field on `AgentDefinition` is the per-subagent loop budget. Soulforge's `loop_stop` frontmatter and the SDK's `maxTurns` are the same concept at different layers. The ARCHITECTURE.md's Loop Termination Policy section should note this correspondence.

- **Hooks = execution filter at the runtime layer.** The SDK's `PreToolUse`/`PostToolUse` hooks are soulforge's execution filter pattern, but native to the substrate rather than requiring a wrapper soul. Soulforge's `execution-filter-soul.md` is the right primitive for when you don't control the runtime. When building on the Claude Agent SDK, native hooks are the simpler implementation.

- **Session-resume as a memory strategy.** Soulforge's memory module focuses on `Map KV`, `SQLite long-term`, and `reflection`. The SDK adds a pattern the memory module doesn't cover: **session-level context resume** — not semantic recall, but full-history continuation. This is useful for long-horizon agents where re-establishing context from scratch on each invocation is expensive.

- **Per-agent model routing.** `AgentDefinition.model` lets each subagent use a different model. Soulforge's multi-agent patterns don't document model budget allocation — it's a practical production concern. "Use Haiku for search/filter subagents, Sonnet for analysis, Opus for the orchestrator" is a cost-architecture choice worth surfacing.

## What soulforge should NOT copy

- **Provider lock-in.** The SDK is Claude-only and deliberately so. Soulforge is provider-agnostic by design. Don't add Claude-specific tool names (Read, Edit, Bash) to soulforge's soul schema or primitive contracts.

- **Filesystem-based agent definitions (`.claude/agents/`).** The SDK supports defining subagents as markdown files in `.claude/agents/` directories loaded at startup. This is a runtime convention that conflicts with soulforge's "repo IS the product surface" principle. Soulforge collocates soul policy in the file itself — agents aren't discovered from a runtime directory.

- **Implicit context compaction.** The SDK fires compaction automatically when the context window fills. For production agents where the compaction boundary matters (e.g., cost accounting, eval replay, deterministic behavior), implicit compaction is a reliability risk. Soulforge's memory module should document explicit checkpointing as the production pattern, using compaction as a fallback not a primary strategy.

- **The no-sub-subagent rule as universal.** The SDK enforces a two-level limit. For soulforge, this is a sane default but not a universal constraint. Long-horizon planning agents may need three-level delegation with explicit trust domains. Don't bake the SDK's constraint into soulforge's multi-agent architecture docs as a fixed principle.

## Sources

- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) — Anthropic official docs
- [Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents) — subagent architecture and context isolation details
- [Claude Agent SDK & Managed Agents analysis](https://zylos.ai/research/2026-04-20-claude-agent-sdk-managed-agents-architecture) — Zylos Research, April 2026
- [arxiv: Inside Claude Code design space](https://arxiv.org/html/2604.14228v1) — architecture review of the underlying agent loop
