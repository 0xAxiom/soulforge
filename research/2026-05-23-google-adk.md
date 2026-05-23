# Google Agent Development Kit (ADK)

**Target:** https://adk.dev — https://github.com/google/adk-python — https://developers.googleblog.com/en/agent-development-kit-easy-to-build-multi-agent-applications/

## What it is

Google ADK is an open-source multi-agent framework released at Cloud NEXT 2025, available in Python, TypeScript, Go, and Java. It structures agents as a typed hierarchy — `LlmAgent` (model-driven reasoning) and `WorkflowAgent` (typed orchestration: Sequential, Parallel, Loop) — all sharing a mutable session state object that acts as a coordination whiteboard between agents. It is Gemini-optimized but model-agnostic and integrates the A2A (Agent-to-Agent) protocol for cross-framework agent interoperability.

## Architecture

- **Three delegation modes, not one.** ADK formalizes three distinct ways agents communicate: (1) shared session state (agents read/write a common `state` dict — the whiteboard), (2) LLM-driven routing (parent agent's model picks which sub-agent handles the request via description-matching), (3) AgentTool (one agent wraps another as an explicit function call). These are separate mechanisms, not variants of the same thing.
- **Session state as the coordination primitive.** Agents do not pass context via message summaries or conversation history. They write structured values to a shared `state` object and read from it. State persists across agent handoffs within a session. This separates coordination (state) from communication (messages).
- **WorkflowAgents are typed, not LLM-driven.** `SequentialAgent`, `ParallelAgent`, and `LoopAgent` are distinct classes whose orchestration logic is deterministic code, not model inference. LLM agents handle reasoning; workflow agents handle scheduling. This is an explicit layering: determinism above, autonomy below.
- **Single-parent hierarchy.** Each agent has exactly one parent. The tree is an org chart. There is no peer-to-peer communication; everything routes through the parent. This prevents state confusion but limits flexible topologies.
- **Description-driven routing.** When using LLM-driven delegation, the parent agent's model reads sub-agent descriptions and picks the best match. Sub-agent capability is declared in a natural-language description field, not in a typed schema. The routing decision is made by the model at call time.
- **A2A protocol for cross-framework calls.** ADK exposes agents as A2A servers and can consume other A2A-compliant agents (LangGraph, CrewAI, custom). The protocol standardizes task submission, streaming, and capability discovery. ADK generates the server wrapper; the agent author just builds the agent.
- **Context assembled structurally.** ADK does not concatenate history into a growing string. Sessions, memory, tool outputs, and artifacts are assembled into a structured context view. The model never sees raw growing context — it sees the assembled view at call time.
- **Built-in eval.** Eval is a first-class development tool, not an afterthought. Test datasets, trajectory comparisons, and metric plugins are integrated into the ADK workflow alongside development and deployment.

## What soulforge can learn

- **Name the three delegation modes explicitly.** Soulforge's `handoff-router-soul.md` covers LLM-driven routing. The `code-orchestrator` likely covers sequential dispatch. But the **shared-state whiteboard** pattern is not named or documented anywhere. Add it as a named pattern in `docs/ARCHITECTURE.md`: "State coordination: agents write structured results to a shared state object rather than routing context summaries to each other." This matters when specialists need to build on each other's outputs without a coordinator repackaging them.
- **WorkflowAgent types map cleanly to endpoint patterns.** Sequential = chained tool calls in one endpoint. Parallel = concurrent tool calls in one endpoint. Loop = polling endpoint with retry. Documenting this mapping in `endpoints/README.md` would help coding agents pick the right endpoint shape for the task.
- **Shared state belongs in memory/session, not in message history.** The ADK approach of reading/writing structured state (not passing conversation summaries) is more auditable and less brittle. Soulforge's memory layer has `SqliteRecallStore` but no concept of "current session state" — a lightweight mutable KV scoped to a session. Worth documenting as an intentional gap or adding as a primitive.
- **A2A as a future endpoint template.** Once the A2A protocol stabilizes, an `a2a-endpoint` template would let soulforge agents advertise themselves as A2A servers. The `x402-endpoint` template shows this pattern already works — payment middleware wraps the agent. A2A registration middleware would work the same way.
- **Eval integration into the development loop.** ADK makes eval a first-class workflow step, not a separate CI job. Soulforge's `eval/` folder exists but isn't referenced in the development guidance in `CLAUDE.md`. The practical steal: add "run eval goldens after adding a new soul" to the CLAUDE.md editing rules.

## What soulforge should NOT copy

- **Description-driven routing.** Routing based on natural-language sub-agent descriptions is convenient but untestable. If the model misreads a description, routing fails silently. Soulforge's explicit routing (the handoff-router soul declares which domains it knows about) is more auditable — the routing contract is in the soul, not inferred from descriptions at call time.
- **Single-parent hierarchy as a constraint.** ADK's "each agent has exactly one parent" rule prevents messy topologies but also prevents legitimate patterns like a shared utility agent called by multiple specialists. Soulforge's `AgentTool` equivalent (calling an agent as a function) should remain available without imposing tree constraints.
- **Google Cloud coupling.** ADK's production deployment path is Cloud Run / GKE with AlloyDB and BigQuery connectors. The framework is model-agnostic at the agent level but infrastructure-coupled at the deployment level. Soulforge's copyable-project model stays more portable.
- **Stateful session objects as mutable global state.** The shared state whiteboard is powerful for coordinating agents within a session but creates ordering dependencies (agent B must run after agent A has written to state). For soulforge endpoints — which are stateless HTTP handlers by default — mutable shared session state is an anti-pattern. Pass structured outputs explicitly between calls rather than relying on side effects in shared state.

## Sources

- https://adk.dev/
- https://developers.googleblog.com/en/agent-development-kit-easy-to-build-multi-agent-applications/
- https://cloud.google.com/blog/topics/developers-practitioners/building-collaborative-ai-a-developers-guide-to-multi-agent-systems-with-adk
- https://cloud.google.com/blog/products/ai-machine-learning/build-multi-agentic-systems-using-google-adk
