# OpenAI Agents SDK — Handoffs, Guardrails, and Span Hierarchy

**Date:** 2026-05-21
**Session:** 12 — morning fire

---

**Target**
- Repo: https://github.com/openai/openai-agents-python
- Docs: https://openai.github.io/openai-agents-python/
- Release blog: https://openai.com/index/new-tools-for-building-agents/ (Mar 2025)

## What it is

OpenAI's official Python SDK for building multi-agent systems, extracted from the Swarm experiment and promoted to production. It adds three named primitives on top of the Responses API: **Agents** (LLM + tools + instructions), **Handoffs** (agent-to-agent delegation as a tool call), and **Guardrails** (parallel or blocking validation at agent entry and exit). The SDK is deliberately minimal — its stated goal is "sufficient features for real-world use, with a low learning curve." It ships with automatic span-based tracing that integrates with 30+ observability vendors.

## Architecture

- **Handoffs as tool calls, not graph edges.** The routing mechanism is elegant: each possible destination agent is registered as a callable tool. The LLM chooses by tool invocation, not by explicit graph wiring. This makes routing introspectable (it appears in the trace as a `function_span`) and keeps the orchestration logic inside the model's reasoning, not outside it.

- **Input filters on handoff.** When handing off, developers can supply an input filter — a function that rewrites `HandoffInputData` (prior history + newly generated items) before the receiving agent sees it. This solves a real problem: specialists should not inherit the full coordinator conversation. The filter can strip tool calls, collapse history into a summary, or inject new context.

- **Guardrails run in parallel by default.** Input guardrails run concurrently with the main agent execution. If the guardrail trips, the agent run is cancelled — but tokens may have already been consumed. A blocking mode exists for cost-sensitive gates. This is an honest tradeoff: parallel is lower latency, blocking is cheaper on failure.

- **Guardrails colocate with agents, not with the Runner.** Each agent declares its own guardrails. This is the right level of abstraction: a refund agent has different input constraints than a FAQ agent, and colocating them makes the agent definition self-documenting.

- **Local context vs LLM context, explicitly separated.** The `RunContext` wrapper carries app state (DB handles, user IDs, loggers) that is never sent to the LLM. The only things the LLM sees are: system instructions, message history, tool definitions, and tool results. This is a clear design principle, not an accident.

- **Span hierarchy is automatic.** Every `Runner.run()` wraps in a `trace()`. Under it: `agent_span` → `generation_span` → `function_span` (one per tool call). Guardrail firings and handoffs each get their own span type. `contextvar`-based parent tracking means nested runs (agent-as-tool) wire into the right parent automatically.

- **Batch span processor as the default exporter.** The pipeline is `BatchTraceProcessor → BackendSpanExporter`. Developers replace or supplement via `set_trace_processors()` / `add_trace_processor()`. The interface is: implement a processor class with `on_trace_start`, `on_trace_end`, `on_span_start`, `on_span_end`.

- **Context type constraint across a run.** All agents, tools, and hooks within a single `Runner.run()` must use the same context type `T`. This enforces cohesion — you can't mix agents that expect different runtime environments in the same orchestration.

- **Structured outputs via `output_type`.** Set `output_type=MyPydanticModel` on an Agent and the framework forces structured outputs mode on the LLM call. The model cannot return free text. This is the same pattern as PydanticAI's `Agent[_, OutputType]` but simpler to declare.

## What soulforge can learn

- **Handoff as a soul pattern, not a framework primitive.** The handoff behavior is fully expressible as a soul instruction: "When a task falls into domain X, call the `handoff_to_specialist` tool with `reason` and `context_summary`. Never hand off raw conversation history — summarize to the facts the specialist needs." A new `handoff-router-soul.md` can encode this concretely, demonstrating triage + context filtering without requiring soulforge to add any runtime.

- **Input filter pattern → `context_handoff` field in soul schema.** Soul frontmatter could gain an optional `receives_context: summary_only | full_history | filtered` field. This is a signal to the agent wiring it up: do not dump the full upstream conversation; the soul expects a structured briefing. The schema can declare this without soulforge owning the filtering logic.

- **Guardrail position as an explicit soul policy.** Soulforge's `approval-gate-soul.md` handles human approval but not fast pre-flight validation. A soul frontmatter field `entry_guardrail: blocking | parallel | none` would let operators understand the cost/latency tradeoff from the soul definition itself, not from reading the deployment config.

- **Span hierarchy as the canonical event shape.** Soulforge's observability JSONL uses `trace_id` + `kind`. The SDK's hierarchy (`trace → agent → generation → function`) suggests adding a `parent_span_id` field and a controlled vocabulary for `kind`: `trace`, `agent`, `generation`, `tool`, `handoff`, `guardrail`. This makes JSONL output queryable in the same mental model as any trace viewer.

- **Processor interface for sink extensibility.** The `set_trace_processors` / `add_trace_processor` pattern maps cleanly to soulforge's `JsonlObservabilitySink`. Adding a `SinkProcessor` interface (two methods: `onEvent(event)`, `flush()`) would let users plug in Langfuse, Datadog, or a custom webhook without forking the JSONL module.

## What soulforge should NOT copy

- **The full Agent class model.** The SDK's `Agent` object bundles instructions, tools, handoffs, guardrails, output type, model settings, and hooks into a single mutable object. This is the right design for a runtime framework. Soulforge is a substrate — the soul is a Markdown document, and the implementation lives in whatever runtime the builder chooses. Translating `Agent` to a class hierarchy in soulforge would make it a framework. CLAUDE.md forbids this.

- **Sessions as a first-class primitive.** The SDK adds automatic conversation history persistence across runs via a `Session` object. Soulforge's memory primitive is more explicit and composable: short-term in context, long-term in a typed store, semantic in a vector backend. Collapsing these to "session history" would be a regression.

- **Realtime agents.** The SDK ships `gpt-realtime-2` voice agent support. This is product surface, not an architectural pattern soulforge needs. Voice modality is out of scope for the current primitive set.

- **OpenAI-backend tracing by default.** The default `BatchTraceProcessor → BackendSpanExporter` sends traces to OpenAI's platform. Soulforge's JSONL-first principle exists precisely to avoid default cloud egress. The processor interface is worth copying; the default destination is not.

## Sources

- https://github.com/openai/openai-agents-python
- https://openai.github.io/openai-agents-python/agents/
- https://openai.github.io/openai-agents-python/handoffs/
- https://openai.github.io/openai-agents-python/guardrails/
- https://openai.github.io/openai-agents-python/tracing/
- https://openai.github.io/openai-agents-python/context/
