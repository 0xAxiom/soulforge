# Mirascope — The LLM Anti-Framework

**Date:** 2026-05-22
**Fire:** morning

---

## Target

Mirascope — Python/TS LLM library built around the "anti-framework" philosophy.
- Repo: https://github.com/Mirascope/mirascope
- Docs: https://mirascope.com/docs
- PyPI: https://pypi.org/project/mirascope/

---

## What it is

A decorator-based LLM interaction library that wraps provider calls without imposing a framework runtime. The entire API surface is `@llm.call`, `@llm.tool`, and Pydantic models for structured output. There is no graph, no chain, no orchestrator — just decorated Python functions and a `response.resume()` loop.

---

## Architecture

- **Decorator-as-policy**: `@llm.call("provider/model", tools=[...], format=OutputModel)` declares everything about a call at the call site. The function body is the prompt template. Input schema is the function signature. Output schema is the Pydantic model.
- **Colocation principle**: prompt + tools + output schema all live on the same function. Nothing is declared elsewhere then wired in later. You read one function and know the full contract.
- **Tool loop via `resume()`**: Agent loop is `while response.tool_calls: response = response.resume(response.execute_tools())`. No graph primitives. No state machine. A while loop is the orchestration layer.
- **Pydantic-native structured output**: `format=Model` on the decorator extracts structured output. Fails back to retry via `max_retries` on the decorator.
- **Provider abstraction is thin**: `"anthropic/claude-sonnet-4-5"` string passes through to the provider. No intermediate model abstraction layer.
- **Monorepo with Python + TS parity** (TS currently paused): deliberate commitment to cross-language consistency; Python SDK is production-ready.
- **Anti-abstraction discipline**: explicitly positions against LangChain's `RunnablePassthrough()` and LCEL. Philosophy: don't hide the LLM call; make it legible at the point of use.
- **FSM/graph feature planned but not shipped** (issue #908): `llm.agent` decorator and `g.FiniteStateMachine` are in design phase; currently proposed as opt-in modules, not core.

---

## What soulforge can learn

- **The `output_schema: "#Section"` pattern is exactly Mirascope's colocation principle.** Embedding the output schema in the soul file (pointing to a section block) rather than a separate JSON file keeps the contract readable at the policy layer. Soulforge already supports this — it should be the *default* example, not the edge case. The `souls/examples/` set has one soul using it; all structured-output souls should.
- **Name the colocation principle explicitly in ARCHITECTURE.md.** "Policy, tools, and output schema are declared in the same document" is a design decision worth naming. Mirascope fought hard to establish this norm and documents why. Soulforge should too.
- **The `resume()` loop is the right mental model for endpoint tool-call handling.** Soulforge's endpoint templates currently show request → tool → response. They don't show the agentic loop case: request → tool calls → execute → resume → structured output. A new endpoint template (or a section in the existing `x402-endpoint.md`) should document this pattern explicitly so a developer wiring up a tool-enabled agent knows the shape.
- **`max_retries` on output validation is load-bearing.** Mirascope puts retry budget directly on the call decorator, not on a separate harness config. Soulforge's soul schema already has `max_retries` — it should be demonstrated in structured-output soul examples so developers know to set it.
- **Anti-abstraction is a stated value, not just a consequence.** Mirascope documents *why* they refuse certain abstractions. Soulforge should add a "What we refuse to abstract" section to ARCHITECTURE.md so contributors stop adding framework-isms.

---

## What soulforge should NOT copy

- **The FSM/FiniteStateMachine proposal.** It's scope creep away from their core identity, and they know it — it's still unshipped after discussion. Soulforge is not a graph execution engine. The while-loop approach is correct for our shape.
- **Provider string as model identifier** (`"anthropic/claude-sonnet-4-5"`). This conflates provider and model into a single opaque string. Soulforge's `provider_hint` field correctly separates hint from binding. Don't collapse them.
- **Python-only orientation.** Mirascope's TS SDK is paused. Soulforge should stay TS-first; Python examples are welcome but not the canonical layer.
- **Decorator magic as the primary learning surface.** Mirascope's `@llm.call` is elegant but opaque to someone reading the function. Soul markdown files are *more* legible because the policy is prose. Don't introduce decorator-style abstractions into soulforge tooling that would obscure the soul's intent.

---

## Sources

- https://github.com/Mirascope/mirascope (README + STRUCTURE.md)
- https://github.com/Mirascope/mirascope/issues/908 (FSM/agent decorator proposal)
- https://mirascope.com/blog/llm-frameworks (anti-framework rationale)
- https://pypi.org/project/mirascope/
