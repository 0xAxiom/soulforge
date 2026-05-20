# PydanticAI — Type-Safe Agent Framework from the Pydantic Team

**Date:** 2026-05-20
**Session:** 10 — morning fire

---

**Target**
- Repo: https://github.com/pydantic/pydantic-ai
- Docs: https://pydantic.dev/docs/ai/overview/
- Evals: https://pydantic.dev/docs/ai/evals/evals/

## What it is

PydanticAI is a Python agent framework built by the Pydantic team that applies the same type-safety-first philosophy to agents that Pydantic V2 applied to data validation. An agent is generic over two types: `Agent[DepsType, OutputType]`. Every tool call, system prompt, and output is validated through Pydantic schemas, moving errors from runtime to write-time. It ships with its own eval framework (`pydantic_evals`), an observability integration (`logfire`), and a graph execution module (`pydantic_graph`).

## Architecture

- **Agent as typed container.** `Agent[DepsType, OutputType]` — the dep type flows into every tool as `RunContext[DepsType]`; the output type enforces structured response shape. The LLM cannot return unvalidated free text.
- **Instructions vs system prompt.** Two distinct channels: `instructions` are re-evaluated at the start of each `run()` call and injected fresh (not persisted into message history); `system_prompt` entries _do_ persist into history across turns. This separation is deliberate — instructions can be dynamic (depend on current deps state) while system_prompt is the stable agent identity.
- **Result validation with retry.** When a structured output fails Pydantic validation, the framework automatically re-prompts the model with the validation error, up to a configurable `retries` budget (default 1). Tools can also raise `ModelRetry` to trigger the same loop.
- **RunContext as typed dep injection.** Every `@agent.tool` receives `RunContext[DepsType]` — a typed container for injected dependencies, retry count, model settings, and token usage. This makes tools testable: swap the dep implementation, not the tool signature.
- **Internal graph state machine.** Under the hood, each `agent.run()` traverses: `UserPromptNode → ModelRequestNode → CallToolsNode → End`. This is powered by `pydantic_graph`, exposing streaming events per node for real-time observability.
- **Probabilistic-aware evals.** `pydantic_evals` uses `Case / Dataset / Evaluator` — each Case has typed inputs, optional expected outputs, and an evaluator. LLM-as-judge is a first-class evaluator type. The framework is explicitly "code-first" and "flexibility over opinionation."
- **Static instructions sorted before dynamic.** System prompt ordering is deterministic: static instructions, then dynamic. This supports Anthropic's prompt caching (stable prefix → cache hits on the dynamic suffix).

## What soulforge can learn

- **`instructions` vs `static_context` split in souls.** Soulforge souls currently have a single identity block. PydanticAI's distinction is worth encoding: a `dynamic_instructions` section (re-evaluated each run, deps-aware) vs the soul body (stable identity, never mutated). This maps to soulforge's `system_prompt` cache hit strategy — stable soul body stays in the LLM's cache; runtime dep state goes in a separate instructions block.

- **Output schema as first-class soul field.** PydanticAI forces you to declare `OutputType` at agent construction. Soulforge souls today describe expected outputs in prose. Adding an optional `output_schema` YAML block in soul frontmatter (referencing a JSON Schema file) would give the eval harness a hard contract to validate against — not just rubric-based LLM judge.

- **Retry budget as explicit soul policy.** PydanticAI's `retries` per agent and per tool is a design lever soulforge's eval goldens don't expose. A soul could declare `max_retries: 2` in frontmatter; the eval harness could track how many retries a golden case needed before passing.

- **RunContext pattern for tools.** Soulforge tools currently list their input/output schema in TypeScript but don't formalize how deps (DB handles, auth tokens, configs) flow in. PydanticAI's `RunContext` is the right model: a single typed container injected at runtime, never threaded through global state.

- **Epoch-based probabilistic eval is validated design.** Soulforge already has `epochReduce` in `eval/score/index.ts`. PydanticAI's explicit "probabilistic awareness" endorses this approach — multiple runs + aggregation is the correct primitive for non-deterministic outputs, not single-shot assertions.

## What soulforge should NOT copy

- **Python type system as the trust boundary.** PydanticAI's value prop is "mypy catches the mismatch at write-time." Soulforge is TypeScript-first and provider-agnostic; the type safety lives in JSON Schema + zod/ajv, not in class generics. Translating the Python idiom directly would mean wrapping every soul in a class hierarchy — that's over-engineering for a repo whose soul format is Markdown.

- **Logfire dependency.** PydanticAI's observability story is tightly coupled to Pydantic's commercial Logfire platform. Soulforge's JSONL-first observability is deliberately free of SaaS lock-in. The event shape can be inspired by PydanticAI's streaming events without adopting the platform.

- **`pydantic_graph` as the execution engine.** The internal graph state machine is elegant, but it's load-bearing code — every agent run goes through it. Soulforge is a substrate, not a runtime. Adding a graph execution primitive would turn it into a framework, which CLAUDE.md explicitly forbids.

- **Capability bundles ("capabilities" API).** PydanticAI recently added composable "capabilities" (web search, MCP, thinking) as named bundles. This is framework accumulation — each capability is a first-class primitive in soulforge (`tools/`, `memory/`), not a bundle attached to an agent class.

## Sources

- https://github.com/pydantic/pydantic-ai (repo, 17.2k stars, 2068 commits)
- https://pydantic.dev/docs/ai/overview/
- https://pydantic.dev/docs/ai/core-concepts/agent/
- https://pydantic.dev/docs/ai/evals/evals/
- https://agentmarketcap.ai/blog/2026/04/06/pydanticai-python-agent-framework-langgraph-crewai-comparison
- https://www.speakeasy.com/blog/ai-agent-framework-comparison
