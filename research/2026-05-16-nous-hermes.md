# NousResearch Hermes

**Date:** 2026-05-16
**Session:** first — seed entry, research/ directory initialized here

---

## Target

- **Model:** [Hermes 3 Llama-3.1-8B on HuggingFace](https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B)
- **Agent framework:** [hermes-agent on GitHub](https://github.com/NousResearch/hermes-agent)
- **Function-calling reference:** [Hermes-Function-Calling on GitHub](https://github.com/NousResearch/Hermes-Function-Calling)
- **Agent docs:** [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/)

---

## What it is

Hermes is two things under one name: a fine-tuned open-weight model (Hermes 3, built on Llama 3.1) trained for reliable function calling and structured outputs, and a full agent framework (hermes-agent) that wraps that model with orchestration, tool registries, memory, and trajectory export for continuous improvement. The model uses ChatML prompt format with XML-wrapped tool calls (`<tool_call>` / `<tool_response>`). The framework wraps around any provider, not just the Hermes model.

---

## Architecture

**Model layer (Hermes 3):**
- ChatML format (`<|im_start|>system … <|im_end|>`) for OpenAI API drop-in compatibility
- Tools injected into system prompt as JSON schemas inside `<tools>` XML tags
- Tool invocations generated as `<tool_call>{"name":…,"arguments":{…}}</tool_call>` — XML wrapper, JSON payload inside
- **`<scratch_pad>` planning block** — introduced in Hermes 3 as GOAP (Goal-Oriented Action Planning) before tool invocation; model explicitly reasons through goal → sub-goals → action sequence before calling anything
- Structured output (JSON mode) via schema-injected system prompt; trains deterministic adherence

**Agent framework layer (hermes-agent):**
- Three-tier separation: *entry points* (CLI / gateway / ACP) → *AIAgent core* (orchestration, provider selection, retry, compression, session persistence) → *backends* (APIs, tool executors, SQLite)
- **Auto-discovery tool registry:** any `tools/*.py` with a `registry.register()` call is discovered at import — no manual list maintenance; 70+ tools across 28 toolsets registered this way
- **Skill documents:** after a complex task, agent writes a structured procedure document (problem → steps → pitfalls → verification) that future sessions load as context
- **Trajectory export:** conversations exported in ShareGPT format for fine-tuning; the dataset that trains Hermes 3 was built this way (hermes-function-calling-v1 on HuggingFace)
- Session lineage via SQLite: parent/child relationships tracked across context compressions so a session knows its own history even after context window resets
- Pluggable memory providers (single-select per agent instance); profile isolation prevents cross-user contamination

**Key tradeoff they made explicit:**
- System prompts stay frozen mid-conversation (no in-flight soul mutation). Prioritizes reliability and traceability over dynamic adaptation. Correct call.

---

## What soulforge can learn

**1. GOAP / scratch_pad as a soul primitive** (→ `souls/`)
The `<scratch_pad>` pattern is the highest-signal idea here. A soul that declares "I plan before I act" produces measurably more reliable tool use. The soul schema's `# Memory` section currently covers persistence; there should be an equivalent section for *reasoning posture* — does this agent plan in-context before tool dispatch, or act immediately? A `planning: scratchpad | none` frontmatter field would let soul authors signal this.

**2. Auto-discovery tool registry** (→ future `tools/` primitive)
Convention-over-configuration for tool registration (file pattern + one call = auto-included) is the right shape for soulforge's tools module when it matures. Avoids "import sprawl" and keeps each tool self-contained. The tradeoff is that the registry must be inspectable — Hermes surfaces its registry as a manifest, which is exactly what the `manifest/` route in soulforge endpoints does.

**3. Trajectory export as eval artifact** (→ `eval/`)
Hermes built its training dataset from agent trajectories. Soulforge's eval module (v2) should treat conversation traces as a first-class export format (ShareGPT or equivalent), not just pass/fail scorecards. Good traces from a production agent become the eval set for the next version of the soul.

**4. Skill documents as a memory type** (→ `memory/`)
Hermes distinguishes between episodic memory (what happened in this session) and procedural memory (how to do a class of task). The skill document format — problem → steps → pitfalls → verification — is a clean schema worth borrowing. Soulforge's `# Memory` soul section could reference this split explicitly.

**5. Session lineage for long-running agents**
Tracking parent/child session relationships across context compressions is the right way to maintain identity across long-running agents. Worth noting explicitly in `docs/ARCHITECTURE.md` as a memory design question.

---

## What soulforge should NOT copy

**1. The monolithic AIAgent orchestrator**
Hermes collapses provider selection, tool dispatch, retry, compression, and session persistence into one class. That works when you own the full stack. SoulForge's primitives are deliberately separate. Pulling them back together into one runtime would undo the five-primitive separation that makes each piece editable independently.

**2. The 70-tool sprawl**
70+ registered tools across 28 toolsets is impressive as a capability demo, but it's the wrong model for soulforge. CLAUDE.md says three concrete examples before extracting shared utility. Two souls don't justify a soul framework. Same logic: two tools don't justify a registry. Grow into the registry pattern; don't start there.

**3. Soul-as-code** (the system prompt is assembled inside the orchestrator)
In hermes-agent, the soul is effectively implicit — it's whatever the AIAgent constructor receives as `system_prompt`. There's no separate soul artifact a non-engineer can read and edit. Soulforge's markdown-first soul is the right call. The soul should be the thing that survives a rewrite of the orchestrator.

**4. Synchronous-only orchestration**
hermes-agent's AIAgent is synchronous by design (cites simplicity). That's a tradeoff that makes sense for their local CLI. Any endpoint-facing agent needs async from the start. Don't inherit synchronous-first thinking.

---

## Sources

- https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B
- https://github.com/NousResearch/Hermes-Function-Calling
- https://github.com/NousResearch/hermes-agent
- https://hermes-agent.nousresearch.com/docs/developer-guide/architecture
- https://huggingface.co/datasets/NousResearch/hermes-function-calling-v1
