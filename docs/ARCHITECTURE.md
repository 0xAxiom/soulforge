# SoulForge Architecture

SoulForge is an AI-native agent engineering substrate. Its primary user experience is a developer giving a natural-language instruction to Claude, Codex, Cursor, an OpenAI agent, or another coding system inside this repo. The architecture exists to make that agent successful: quick navigation, explicit contracts, predictable file placement, eval-backed development, observable execution, and replayable workflows.

SoulForge is not centered on a CLI or framework runtime. The generator is a supporting accelerator. The repository structure is the product surface.

## Layers

```text
AI guidance     -> .ai/
optional scaffold -> generator/
agent policy    -> souls/
capabilities    -> tools/
interfaces      -> endpoints/
state           -> memory/
verification    -> eval/
telemetry       -> observability/
research        -> research/
```

Implementation belongs in the primitive folders. `.ai/` is the machine-readable navigation layer. `generator/` is an optional source of known-good starting structures and smoke-tested examples. Neither orchestrates agents at runtime.

## Composition

```mermaid
flowchart LR
  Dev["Developer"]
  Prompt["Natural-language instruction<br/>Claude / Codex / Cursor"]
  AI[".ai guidance<br/>repo-map + task routing"]
  Examples["Neighboring examples<br/>contracts + tests"]
  Soul["Soul<br/>markdown policy"]
  Tools["Tools<br/>typed capabilities"]
  Memory["Memory<br/>local state and recall"]
  Endpoint["Endpoint<br/>HTTP or local handler"]
  Eval["Eval<br/>goldens and traces"]
  Obs["Observability<br/>JSONL telemetry"]
  Gen["Optional scaffold<br/>soulforge new"]
  Deploy["Deployment<br/>copyable project"]

  Dev --> Prompt --> AI --> Examples --> Soul --> Tools --> Memory --> Endpoint --> Eval --> Obs --> Deploy
  AI -. optional accelerator .-> Gen -. starting structure .-> Soul
  Tools --> Obs
  Endpoint --> Obs
  Memory --> Eval
```

## Primitive Contracts

| Primitive | Inputs | Outputs | Side effects | Replay guarantee |
| --- | --- | --- | --- | --- |
| `souls/` | Markdown with validated frontmatter | Human-readable policy | None | Versioned markdown diffs |
| `tools/` | Typed schema inputs | Schema-validated objects | External calls, local side effects | Receipts and typed errors |
| `endpoints/` | HTTP/local requests | Structured responses | Tool calls, payment checks | Request and receipt traces |
| `memory/` | Records, transcripts, recall text | JSON/SQLite records | Local persistence | Provenance and transcript hashes |
| `eval/` | Souls and goldens | Scores, traces, cache | Local JSONL/cache writes | Deterministic replay |
| `observability/` | Cost, latency, error, receipt events | JSONL events | Local append-only files | Trace/session/turn IDs |

## Economic Boundary

Base-native economic actions are tool calls, not soul fields and not framework lifecycle hooks. A soul may define policy and refusal conditions. A tool owns executable contracts and safety checks.

```text
soul policy -> typed economic tool -> cap/payment boundary -> Base/Bankr -> receipt -> obs/eval/memory
```

Required controls:

- dry-run default
- explicit live flag
- network allowlist
- spending cap
- idempotency key
- scoped wallet or sub-account
- receipt persistence
- observability event

## AI-Native Design

Most repos are difficult for coding agents because architecture is implicit. SoulForge makes it explicit:

- `.ai/repo-map.json` tells agents where things live.
- `.ai/task-routing.md` maps natural-language requests to primitives.
- Examples show the same file structure repeatedly.
- Templates provide optional known-good starting structures.
- Tools expose typed contracts.
- Eval goldens define expected behavior.
- Observability makes side effects inspectable.
- Docs state invariants near the code they govern.

## Natural-Language Task Routing

When an AI coding agent receives a request, it should translate the request into primitives before writing code:

| User asks for | Required primitives |
| --- | --- |
| Research agent | `souls/`, local tools, endpoint/example, eval, observability |
| Agent with memory | `memory/`, reflection, recall, memory failure tests |
| x402-paid agent | endpoint payment boundary, receipt capture, eval, observability |
| Bankr or trading agent | `tools/bankr/`, dry-run default, caps, idempotency, receipts |
| Long-horizon monitor | memory checkpoints, idempotent actions, scheduler docs, eval replay |
| Planner/executor | planner soul, executor tool, typed handoff records, trace capture |

The generator can accelerate this routing, but the agent must still inspect and wire the relevant primitives directly.

## Agent Loop vs. Deterministic Step Graph

Every multi-step soul faces a structural choice: does the model control the sequence, or does the developer?

| Dimension | Agent loop | Deterministic workflow |
| --- | --- | --- |
| Who decides next step | The model at runtime | The developer at design time |
| Correct when | Required steps are unknowable in advance | Required steps are fully known before execution |
| Failure mode | Model improvises a bad sequence | Typed mismatch halts and surfaces the bug early |
| Replayability | Hard — model may choose differently on retry | Easy — checkpoint per step, resume from last good state |
| Soul to use | `tool-planner` or open-ended soul | `deterministic-workflow` soul |

**Prefer deterministic workflows** when: the pipeline maps a known data shape through a known sequence of transformations. Research-fetch → extract → draft → publish is always that sequence; the model should not reorder it.

**Prefer agent loops** when: the next step depends on what the previous step returned in a way that cannot be specified upfront. Debugging an unknown codebase, answering questions across an unfamiliar document corpus, or planning in a dynamic environment all require the model to decide what to do next.

**Typed handoff records** are the key invariant for deterministic workflows. Each step declares its input and output schema. The state flowing between steps is a named record, not an untyped context blob. See `souls/examples/deterministic-workflow-soul.md` for the reference pattern.

**Checkpoint after every step.** A deterministic workflow without checkpoints cannot be debugged or resumed. The checkpoint is a serialized copy of the handoff record after a successful step — enough to restart from that point without re-running earlier steps.

## Multi-Agent Delegation Modes

When one soul delegates to another, there are three structurally distinct modes. Choosing the wrong one produces ordering bugs, latency waste, or untraceable state. Name the mode explicitly in the orchestrator soul's plan block before executing.

| Mode | When to use | How context moves | Key risk |
| --- | --- | --- | --- |
| **Sequential dispatch** | Stage N needs stage N-1's output as input | Explicit briefing passed as structured input to each specialist | Latency — stages cannot overlap |
| **Parallel dispatch** | Specialist inputs are independent; latency matters | Concurrent dispatch; results collected into a keyed dict after all complete | Ordering dependency hidden at design time causes incorrect merges |
| **Shared-state pipeline** | Specialists build incrementally on each other's outputs without needing a coordinator to repackage between calls | Specialists read/write a shared state object; execution order declared upfront | State mutation order is invisible — specialist B may see a stale value if A has not yet written |

Reference implementation: `souls/examples/workflow-orchestrator-soul.md` demonstrates all three modes within a single orchestration pattern. The soul's `# Delegation Modes` section specifies when each mode is correct and what state discipline it requires.

**Default to sequential dispatch** unless you have measured the latency cost and confirmed that no parallel specialist reads a value written by another parallel specialist. Parallel dispatch bugs are silent; sequential dispatch bugs surface immediately as empty inputs.

**Shared-state pipeline** is only appropriate inside a session (state is ephemeral). For stateless HTTP endpoints, pass outputs explicitly between calls — do not rely on shared mutable state as a coordination mechanism.

## Execution Filter Pattern

Some safety, observability, and policy requirements are horizontal — they apply to every tool call, not to one specific agent. Baking these checks into each soul's body produces repetitive policy, inconsistent enforcement, and no single audit point.

The execution filter pattern solves this with a wrapper soul that intercepts at two explicit points around any tool invocation:

- **`before_tool_call`** — synchronous, blocking. Validates inputs against policy (spending caps, domain allowlists, PII detection, rate limits) before any side effect fires. If a check fails, execution stops here.
- **`after_tool_call`** — runs after the tool completes. Captures cost, latency, and output quality signals; redacts PII if found in outputs; emits traces to both observability and eval.

This maps directly to soulforge's primitive boundary: the filter soul owns *interception policy*; the downstream agent soul owns *task policy*. Neither modifies the other.

When to use a filter soul vs inline soul logic:

| Concern | Where it belongs |
| --- | --- |
| Check applies to one tool in one agent | Inline in that agent's soul `# Tools` section |
| Check applies to any tool call across multiple agents | Execution filter soul |
| Check requires blocking before execution | `before_tool_call` in filter |
| Audit/capture needed after execution | `after_tool_call` in filter |
| Transform or rewrite outputs | Separate critic/reviewer soul, not a filter |

**Filter checks must be deterministic.** Pre-call checks run synchronously before the tool fires; they must be rule evaluation (pattern match, cap comparison, allowlist lookup), not LLM calls. LLM-as-judge runs async post-call as an eval concern, not a safety gate.

**Every intercept writes an event.** A filter that runs silently provides false confidence. The obs event is the filter's output — not optional, not async buffered. Passed calls and blocked calls both write. Blocked calls log the reason category, never the triggering payload.

Reference implementation: `souls/examples/execution-filter-soul.md`.

## Colocation Principle

The most important structural norm in SoulForge is that a soul file should be self-describing: a reader should understand what the agent does, what tools it uses, what output it produces, and under what conditions it refuses — all from a single document.

This means:

- **`output_schema: "#Section"`** — prefer embedding the output schema in the soul file as a fenced JSON block and pointing to it with a fragment reference. A separate `.json` schema file is acceptable for schemas shared across multiple souls, but the default is colocation.
- **Tools declared in the soul body** — the `# Tools` section lists every tool the agent may call, what it does, and when. An endpoint or harness may provide additional tools; the soul should still list them explicitly so the document is self-contained.
- **Retry budget in frontmatter** — `max_retries` on the soul, not in a harness config file, so the structured-output contract and the failure budget are readable together.

The payoff: a developer or AI agent can read one file and understand the full contract. Nothing is wired up elsewhere. This is deliberately different from framework patterns that declare tools, schemas, and policies in separate configs and wire them at runtime.

## Loop Termination Policy

Every soul that runs a multi-step loop needs an explicit stop condition. "The model decides when it's done" is not a stop condition — it is a budget leak and a reliability gap.

SoulForge names two complementary stop mechanisms:

**1. `loop_stop` frontmatter field — named exit predicates**

A soul may declare a list of named exit predicates in frontmatter:

```yaml
loop_stop:
  - evaluation_passed
  - retry_budget_exhausted
  - tool_called:finalAnswer
  - step_count:20
```

Each predicate is checked after every step. The loop stops on the first predicate that matches. Predicates are OR-composed — the loop does not require all to fire. The soul body must document what each predicate means and when it can become true.

This is different from `max_retries`, which is a schema-validation retry budget (typed output souls only). `loop_stop` is for any multi-step loop — quality-check loops, tool-planning loops, search loops.

**2. Explicit loop contract in the soul body**

For souls with a meaningful loop (more than one step), declare a `# Loop Contract` section that lists:

- The sequence of operations per cycle (e.g., generate → evaluate → check → retry)
- The exit conditions, in priority order
- What state is carried forward across cycles (context, critique, draft history)
- What happens when the budget is exhausted (return best-effort, surface the reason)

The loop contract is human-readable policy. It does not enforce itself. The implementation is responsible for honoring it. The contract's value is auditability: a reviewer should be able to read the soul and predict exactly when the loop stops.

**Reference:** `souls/examples/evaluator-optimizer-soul.md` — demonstrates both a `loop_stop` frontmatter declaration and a `# Loop Contract` section for a generator→evaluator quality loop. See also `souls/examples/tool-planner-soul.md` for the open-ended case where the model controls step selection but the loop still has a named exit budget.

## Type-Declared Event Contracts

When a pipeline has multiple steps handled by different souls, an orchestrator needs to know which soul handles which event type. There are two ways to solve this:

| Approach | How routing works | When to use |
| --- | --- | --- |
| **Name-dispatch** | Orchestrator has a table: `event_type → soul_name`. Explicit, auditable. | Fixed pipelines where the set of steps is known at design time. |
| **Type-declared** | Each soul declares `input_event_types` and `output_event_types` in frontmatter. Orchestrator discovers routing by reading soul frontmatter. | Extensible pipelines where new souls can be added without editing a routing config. |

The type-declared approach is inspired by LlamaIndex Workflows, where `@step`-decorated functions register themselves by their Python type signatures. The framework builds the routing graph automatically from those signatures. The same idea applies in soulforge without Python: a soul can declare its event types in frontmatter, and a coding agent or orchestrator can wire the pipeline by reading those declarations.

**When to use type-declared routing:**
- A pipeline is designed to be extended by adding new souls without modifying existing ones.
- The orchestrator is a coding agent (not a human) that will discover souls by scanning a folder.
- Different teams own different souls and should not need to coordinate on a central routing config.

**When to use name-dispatch:**
- The pipeline sequence is fixed and must be auditable from a single routing document.
- Tracing a request through the pipeline requires knowing exactly which soul handled each step.
- The routing logic has conditional branches (if step A returned X, go to B; if Y, go to C) — this is hard to infer from types alone.

**Frontmatter convention for type-declared souls:**

```yaml
input_event_types:
  - DocumentExtracted       # the soul handles this event type
output_event_types:
  - DocumentSummarized      # the soul emits this event type on success
  - DocumentFailed          # the soul emits this event type on failure
```

Event type names should be PascalCase, globally unique within the pipeline, and map to a schema defined in the pipeline's event registry (a shared JSON file, not embedded per-soul). The soul's `# Handoff Record` or `# Output Schema` section defines the payload for each output event type it declares.

An orchestrator discovers the routing graph by: (1) scanning souls for `input_event_types` and `output_event_types` declarations, (2) building a map from event type to handling soul, (3) executing steps in topological order. Step N's `output_event_types` must be a subset of Step N+1's `input_event_types`.

## Typed State Schema

Multi-step agents accumulate state across tool calls. Soulforge souls use `state_keys_written` in frontmatter to name the keys they write. This naming is necessary for auditing but not sufficient for validation — it says what keys exist, not what shape they hold.

The **typed state schema** pattern extends this convention by declaring key types alongside key names. A soul or endpoint declares:

```yaml
state_schema:
  research_findings: string[]
  draft: string
  fact_check_report: "{ passed: boolean, issues: string[] }"
  stage_log: "{ stage: string, status: string, error?: string }[]"
```

This declaration serves three purposes:

1. **Coding agent guidance.** When a coding agent assembles an endpoint that uses this soul, it can validate that tool outputs match declared key types before wiring them up — catching type mismatches at assembly time, not execution time.

2. **Endpoint harness validation.** An endpoint can validate state reads and writes against the schema at runtime, emitting a typed error when a tool writes a value that does not match the declared type. This surfaces contract violations as named errors, not silent data corruption.

3. **Eval coverage signal.** A golden test can assert that every declared state key was written at least once during a successful run. Keys that are declared but never written indicate dead code or a missing tool call.

**Relationship to `state_keys_written`:**

`state_keys_written` remains the minimal declaration — just the names, enough to audit which keys the soul touches. `state_schema` is the extended form for souls that need validation. Not every soul needs it; a simple single-turn agent with no shared state needs neither. Add `state_schema` when:

- Multiple tools read from and write to the same state object.
- An orchestrator or eval harness needs to validate intermediate state between stages.
- The soul is used as a component by another soul (the outer soul's tool contract includes the inner state shape).

**Convention:**

```yaml
# minimal (always enough for auditing)
state_keys_written:
  - research_findings
  - draft

# extended (add when validation is needed)
state_schema:
  research_findings: string[]
  draft: string
```

State key naming follows the existing convention: `<kind>:<stable-id>` for long-term keys, plain camelCase or snake_case for session-scoped keys. State schema types use TypeScript-compatible type strings. Complex types should reference a named interface in the module's TypeScript source, not embed a full inline definition.

This pattern is drawn from Haystack's `state_schema` agent contract (research: `research/2026-05-28-haystack.md`), where `Agent` components declare typed state keys that tools read from and write to, enabling validation of state access before execution.

---

## What This Is Not

- Not a runtime package.
- Not a provider wrapper.
- Not a hidden orchestrator.
- Not a LangChain, AutoGPT, or plugin-runtime clone.
- Not a place for generated opaque soul formats.
- Not a graph execution engine — if you need a state machine with edges, you have a deterministic workflow problem, not a soul problem. Use `deterministic-workflow-soul.md` and typed handoff records.

The bet: agents should be easy to create, hard to create incorrectly.
