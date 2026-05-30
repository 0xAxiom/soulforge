# souls/

A **soul** is a versioned authoring of an agent's identity, voice, values, and limits. It is markdown that a human can read, with a small amount of structured metadata that a machine can validate.

## Why markdown

Souls are edited often, by people who are not always engineers. A YAML schema-only soul is hostile to that workflow. A markdown soul with a frontmatter block keeps the writing primary and the structure light.

## Structure

```markdown
---
name: my-agent
version: 0.1.0
provider_hint: anthropic | openai | local
scope:
  - one
  - sentence
  - per
  - line
refuses:
  - one
  - sentence
  - per
  - line
---

# Identity

Who is this agent. One paragraph.

# Voice

How does it speak. Bullet list of three to seven traits, with one example each.

# Values

What does it care about. Bullet list, with rationale.

# Limits

What does it refuse to do, and how does it refuse. Specific examples.

# Tools

Brief description of each capability the agent has. Full type definitions live in the agent's code.

# Memory

What it remembers, what it forgets, what triggers reflection.
```

The frontmatter is validated against `schema/soul.schema.json`. The sections under `# Identity` etc. are convention, not strict requirement — but every soul in `examples/` follows the same shape, and tooling assumes it.

### Optional: `# Signature` section

A soul that will be composed into a multi-step pipeline or wired as a step in a deterministic workflow can declare an explicit typed input/output contract in a `# Signature` section placed *before* `# Identity`. The section is markdown — a table for inputs and a table for outputs:

```markdown
# Signature

**Inputs**

| Field   | Type     | Constraint       | Description          |
| ------- | -------- | ---------------- | -------------------- |
| `query` | `string` | 1–500 characters | The search question. |

**Outputs**

| Field     | Type       | Description                         |
| --------- | ---------- | ----------------------------------- |
| `results` | `string[]` | Ranked list of relevant passages.   |
| `sources` | `url[]`    | URLs for each result, same order.   |
```

The signature is the composition surface: an orchestrator reading two soul files should be able to confirm that the output type of step N satisfies the input type of step N+1 without running either. This pattern is borrowed from DSPy's Signature abstraction — see `research/2026-05-19-dspy.md`.

The `# Signature` section is optional and carries no frontmatter counterpart. It is human-readable documentation, not runtime enforcement. Runtime type checking belongs in the implementation's TypeScript types, not the soul.

## Validation

A soul's frontmatter is validated against `schema/soul.schema.json` with `souls/validate.mjs`. From the repo root:

```bash
npm install                                       # one-time
npm run validate-souls                            # validates every souls/examples/*.md
node souls/validate.mjs path/to/your-soul.md      # validate a specific file
```

The validator exits non-zero on the first soul that fails, with a per-error path and reason. Both bundled examples pass.

## Optional frontmatter fields

Beyond the required fields, souls can declare behavioral hints in frontmatter that tooling and orchestrators can act on:

| Field | Values | Meaning |
|-------|--------|---------|
| `planning` | `scratchpad` \| `explicit-schema` \| `interval` \| `none` | How this agent plans before acting. `scratchpad` = reason goal → sub-steps → fallback before tool calls. `explicit-schema` = declare the full pipeline handoff record and step sequence before execution begins. `interval` = pause periodically mid-run to update a fact list and re-examine next steps (pair with `planning_interval_steps`). See `examples/tool-planner-soul.md`, `examples/deterministic-workflow-soul.md`, and `examples/code-orchestrator-soul.md`. |
| `planning_interval_steps` | integer | Used when `planning: interval`. Number of action steps between planning checks. Default: 3. |
| `action_format` | `code` \| `json` \| `text` | Declares the agent's action format. `code` = agent writes executable Python snippets to orchestrate tools. `json` = agent emits structured JSON tool-call objects. `text` = free-form prose actions. Default: `json`. See `examples/code-orchestrator-soul.md` for the `code` pattern. |
| `tags` | list of strings | Free-form labels for soul registry/search. |
| `max_retries` | integer (default 1) | Retry budget for structured output validation failures. When the agent's output fails the declared schema, it re-prompts with the error up to this many times before returning a best-effort response. Pair with an `## Output Contract` section in the soul body. See `examples/typed-output-soul.md`. |
| `output_schema` | string reference | Human-readable pointer to where this soul's output contract is defined (inline section, external JSON Schema file, or TypeScript type). Signals to orchestrators that this soul has a machine-readable output shape. |
| `routing` | `explicit` \| `rule-based` \| `pub-sub` | How this agent selects a downstream destination. `explicit` = model picks from registered handoff tools by description. `rule-based` = deterministic rules pick the destination. `pub-sub` = agent publishes typed events to topics; subscribers self-select (no explicit routing). Omit for souls that do not route or dispatch. See `examples/handoff-router-soul.md` and `examples/event-dispatcher-soul.md`. |
| `coupling` | `tight` \| `loose` | Whether the agent's downstream targets are enumerated at authoring time (`tight`) or discovered at runtime via subscriptions (`loose`). Only meaningful when `routing` is set. |
| `fan_out` | boolean | When true, a single published event may reach multiple downstream handlers concurrently. Pair with `routing: pub-sub`. |
| `context_handoff` | `summary_only` \| `full_history` \| `filtered` \| `none` | What context this soul passes when handing off (or expects to receive). `summary_only` = structured briefing only, no raw history. `filtered` = caller applies an input filter to strip irrelevant turns. See `examples/handoff-router-soul.md`. |
| `entry_guardrail` | `blocking` \| `parallel` \| `none` | Validation posture before routing or execution. `blocking` = guardrail completes before any LLM call (prevents token spend on bad requests). `parallel` = guardrail runs concurrently (lower latency, tokens may be consumed before a block). Default: `none`. |

## Examples

| File | Pattern | When to copy it |
|------|---------|-----------------|
| `examples/starter-soul.md` | Minimal reference soul | Starting point for any new soul |
| `examples/tool-planner-soul.md` | GOAP planning posture | Agent loop — model decides next step; tasks where step sequence is unknowable upfront |
| `examples/deterministic-workflow-soul.md` | Typed step graph | Developer-defined sequence with typed handoff records between steps; halts cleanly on shape failures |
| `examples/approval-gate-soul.md` | Human-in-the-loop gates | Pipeline with declared pause points where a human must decide before the next step runs; includes gate audit trail |
| `examples/text-classifier-soul.md` | Typed-IO contract | Soul that declares explicit input/output types (# Signature section); copy when the soul will be composed into a pipeline and callers need to know the interface without reading the prose |
| `examples/typed-output-soul.md` | Structured output + retry | Soul that declares a machine-readable JSON Schema output contract and a retry budget; copy when the agent must return validated structured data and silent type failures are unacceptable |
| `examples/code-orchestrator-soul.md` | Code-action multi-step agent | Agent writes Python snippets to orchestrate tools (loops, conditionals, variable storage) rather than JSON tool-call objects; includes periodic planning check; copy when task requires composing tool outputs mid-step or iterating over variable-length lists |
| `examples/handoff-router-soul.md` | Triage-and-handoff coordinator | Classifies intent, builds a structured briefing, and routes to a specialist soul — never handles domain tasks itself; includes entry guardrail and context hygiene policy; copy when multiple specialist agents exist and routing should be logged and traceable |
| `examples/event-dispatcher-soul.md` | Pub-sub event dispatcher | Publishes typed events to named topics; downstream handlers self-subscribe without the dispatcher knowing them; fan-out by default; inspired by AutoGen's actor model; copy when the handler population is dynamic or a new subscriber should not require changing the dispatcher |
| `examples/execution-filter-soul.md` | Execution filter / middleware | Wraps another agent's tool calls with `before_tool_call` (blocking pre-checks) and `after_tool_call` (cost, PII, eval capture) intercepts; inspired by Semantic Kernel's filter chain; copy when safety and observability requirements are horizontal across multiple agents and you need a single audit point |
| `examples/evaluator-optimizer-soul.md` | Quality-control loop | Generator + inline evaluator in a single soul; retries with critique injected until criteria pass or retry budget exhausted; inspired by Vercel AI SDK v5's Evaluator-Optimizer pattern; copy when the task has named objectable criteria and single-pass generation has known failure modes |
| `examples/social-channel-soul.md` | Social channel ingress | Handles messages arriving from Telegram, Discord, Farcaster, or Slack; declares the social context shape (sender identity, channel ID, history window, platform constraints) explicitly; shows per-user fact recall + update pattern; inspired by ElizaOS's Client/Provider primitives; copy when building agents that live inside persistent social channels rather than HTTP endpoints |
| `examples/workflow-orchestrator-soul.md` | Workflow orchestration coordinator | One coordinator that breaks a multi-step task into specialist calls, chooses sequential vs parallel delegation per stage, and assembles results without doing specialist work itself; demonstrates all three delegation modes in a single soul; copy when an orchestrator dispatches to multiple named specialists and routing must be logged and traceable |
| `examples/context-isolated-fanout-soul.md` | Context-isolated fan-out | Parent dispatches independent work items to multiple specialists in parallel; each specialist receives a minimal, self-contained briefing with no parent history or other specialists' outputs; prevents context pollution at the architecture level; copy when parallel specialists must produce attributable, debuggable results |
| `examples/role-specialist-soul.md` | Worker specialist (research) | Worker-role soul designed to be dispatched by an orchestrator — receives a bounded task, returns structured findings; declares an explicit `# Signature` for typed orchestrator integration; copy when building the specialist side of a handoff-router or workflow-orchestrator pattern |
| `examples/structured-extractor-soul.md` | Typed schema extractor | Reads unstructured text and maps it to a co-located typed schema; never invents a value for fields that cannot be reliably extracted (returns `null`); schema and policy in one file so callers need to read only this document; copy when the task is deterministic field extraction from prose |
| `examples/knowledge-grounded-soul.md` | Knowledge-grounded response | Maintains a hard boundary between a static operator knowledge base and dynamic session memory; queries both in a defined order before asserting any fact; every claim carries a `source` label (`knowledge \| memory \| reasoning`); drawn from Agno's Knowledge/Memory/Storage distinction; copy when factual accuracy and attribution are correctness requirements |
| `examples/tiered-memory-soul.md` | Tiered / labeled memory blocks | Memory as explicit named containers (core in-context, recall, long-term) with declared purpose and capacity constraints; agent may update a block only via an explicit tool call; based on Letta's tiered memory architecture applied to soulforge primitives; copy when the agent accumulates distinct classes of state that must never bleed across containers |
| `examples/onchain-action-soul.md` | Onchain action agent | Demonstrates three AgentKit-derived architectural choices: initialization contract (wallet + network check before accepting any request), capability filtering (`networks` field per tool), and dry-run default with explicit live gate; copy when building agents that execute transactions on Base or other EVM chains |
| `examples/eval-judge-soul.md` | Eval judge (LLM-as-judge) | Neutral scoring agent for rubric criteria too open-ended for deterministic assertions (voice quality, reasoning coherence, refusal tone); every verdict includes a reason anchored to the rubric criterion; sits inside the eval tier; copy when golden assertions need qualitative scoring alongside numeric checks |

## Current boundary

The soul layer owns human-readable policy and schema validation. Generated agents keep executable wiring in their own `src/` files, not in the soul. If you need rendering, diffing, or provider-specific prompts, implement that as a tool or generator concern and keep the soul markdown provider-agnostic.
