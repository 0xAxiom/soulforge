# Vercel AI SDK (v5)

**Target** — https://ai-sdk.dev · https://github.com/vercel/ai · https://vercel.com/blog/ai-sdk-5

## What it is

The Vercel AI SDK is a TypeScript toolkit for building AI-powered applications and agents against 20+ model providers through a unified API. Version 5 (July 2025) was a significant architectural rework that added first-class agent loop control, separated UI state from model context, and replaced a custom streaming wire format with standard SSE.

## Architecture

- **Unified provider API** — `generateText` and `streamText` are provider-agnostic. Provider adapters plug in; the call site doesn't change. This is the opposite of soulforge's stance (provider-agnostic soul docs + user-supplied wiring) but achieves the same end goal.

- **UIMessage / ModelMessage split** — v5 forces a hard separation: `UIMessage` is the canonical source of truth for application state (rich, persistent), while `ModelMessage` is what actually goes to the LLM (lean, compressed). You convert between them explicitly. This eliminates the common bug of sending stale or bloated app state to the model.

- **`stopWhen` — named exit predicates** — loop termination is declared as composable named predicates: `stepCountIs(20)`, `hasToolCall("finalAnswer")`, `tokensUsed(4000)`. Multiple conditions are OR-composed. This is a named contract, not a magic number buried in a while loop.

- **`prepareStep` — between-step hooks** — fires before each step in the loop with full access to the step index and accumulated messages. Use cases: switch to a cheaper model for mid-loop steps, compress context when tokens are running high, toggle available tools based on prior step output. This is a structured hook point, not an escape hatch.

- **`Agent` class — thin optional wrapper** — wraps `generateText` or `streamText`. Everything the Agent class does is achievable with the underlying functions. The class is a named grouping (LLM config + tools + behavior), not a capability upgrade. Deliberately decoupled from the runtime.

- **Five workflow patterns** — Sequential (chains), Routing (model-picks-branch), Parallel (concurrent workers), Orchestrator-Worker (coordinator + specialists), Evaluator-Optimizer (quality loop with critique and retry). The SDK names these patterns explicitly and provides composable building blocks for each.

- **SSE wire format** — v5 dropped the custom streaming protocol. Standard SSE means no custom client, easier debugging, and browser-native support.

- **Memory as external concern** — memory integrations (Letta, Mem0, Supermemory) are plugged in as provider tools or custom tools. The SDK does not own persistence. It does name three modes: provider-defined tools (vendor convenience), memory providers (service dependencies), and custom tools (full control).

## What soulforge can learn

- **Name loop exit conditions explicitly.** The `stopWhen` pattern turns "the loop stops when…" into a soul-level contract. Currently soulforge's loop control vocabulary is limited to `max_retries` (schema validation budget) and `planning: interval`. Neither captures "stop when a tool has been called" or "stop when token budget is near." A `loop_stop` frontmatter field that enumerates named predicates would give soul authors a place to declare this. See **Architecture** section addition below.

- **Evaluator-Optimizer as a named pattern.** AI SDK 5 names this explicitly: a dedicated evaluation step runs after generation; if it doesn't pass, the loop retries with the critique injected. Soulforge has `eval-judge-soul.md` as a standalone eval soul and `max_retries` for schema validation, but no soul that demonstrates a *generator + inline critic in one loop*. This is a real gap worth filling with an example. See `souls/examples/evaluator-optimizer-soul.md` (new, this commit).

- **UIMessage/ModelMessage as a memory framing.** The split belongs in the memory README: distinguish "what the application stores" (rich, long-lived) from "what actually reaches the model" (compressed, trimmed to fit context). The `tiered-memory-soul.md` gets at this implicitly, but the framing should be named at the memory layer README level.

- **`prepareStep` maps to `planning: interval` but is more concrete.** The interval planning pattern in soulforge (pause every N steps, reassess) is close to `prepareStep`, but soulforge hasn't named the specific actions that make sense there: model-switch, context-compress, tool-filter. Worth noting in the interval planning docs.

## What soulforge should NOT copy

- **The `Agent` class.** Soulforge souls are markdown documents, not class instances. Wrapping `generateText` into a class is a convenience for TypeScript code authors. It has no analog in a soul file. Resist the urge to add an `agent_class` soul field — it would be the framework lock-in soulforge explicitly avoids.

- **Provider memory integrations as first-class primitives.** Letta, Mem0, Supermemory are memory providers that become soul dependencies. Soulforge deliberately doesn't own persistence; the memory layer documents patterns and provides SQLite primitives. Integrating named providers would create the "hidden dependency" problem that CLAUDE.md calls out.

- **SSE wire format specifics.** Streaming wire format is an endpoint concern, not a soul concern. The soulforge endpoint layer already documents how to handle streaming; this isn't a soul design question.

- **The "start simple" philosophy as a structural recommendation.** AI SDK's docs say "start with the simplest approach that meets your needs" as guidance for users picking workflow patterns. Soulforge's CLAUDE.md has a stronger position: "No half-finished modules" and "No speculative abstractions." The AI SDK philosophy is right for application code but too loose for a substrate — the substrate needs to ship complete patterns, not minimum viable stubs.

## Sources

- https://ai-sdk.dev/docs/introduction
- https://ai-sdk.dev/docs/agents/building-agents
- https://ai-sdk.dev/docs/agents/workflows
- https://ai-sdk.dev/docs/agents/memory
- https://vercel.com/blog/ai-sdk-5
- https://github.com/vercel/ai
