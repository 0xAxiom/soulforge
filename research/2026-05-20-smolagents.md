# smolagents — Code Actions over JSON Tool Calls

**Date:** 2026-05-20
**Session:** 11 — evening fire

---

## Target

- Repo: https://github.com/huggingface/smolagents
- Docs: https://huggingface.co/docs/smolagents/en/
- Paper (code actions): https://huggingface.co/papers/2402.01030

---

## What it is

HuggingFace's minimal agent framework (~1,000 lines of core logic). Its central claim: LLMs should write Python code as their action format rather than JSON tool-call blobs, because code is compositional, handles object state, and is already saturated in training data. Two agent types — `CodeAgent` (code actions) and `ToolCallingAgent` (JSON actions) — both built on a single `MultiStepAgent` ReAct base class.

---

## Architecture

- **Code actions as the default action format.** Instead of `{"tool": "search", "args": {"query": "..."}}`, the model emits a Python snippet: `result = search(query="..."); print(result)`. The interpreter executes it, captures stdout as the observation, and feeds it back. This allows loops, conditionals, variable storage, and tool composition inside a single step.

- **Agency spectrum as a design vocabulary.** smolagents formalizes six agency levels from "simple processor" (LLM output has zero control flow impact) up to "code agent" (LLM writes programs that can define tools and spawn sub-agents). This is a useful taxonomy for communicating design intent — "this system is level 3" is more precise than "it uses tool calls."

- **Instructions vs system_prompt — two separate channels.** `instructions` are appended to the system prompt but re-evaluated fresh at the start of every `.run()` call (good for dynamic context: user's timezone, current task metadata). `system_prompt` entries persist in message history across turns (good for stable identity). The distinction prevents dynamic context from polluting history and stable identity from going stale.

- **Planning interval as a first-class knob.** Pass `planning_interval=N` to trigger a mid-run reflection step every N action steps where the LLM is asked to update its fact list and reconsider next steps — no tool calls, pure reasoning. This is separate from the main ReAct loop, not embedded in the system prompt.

- **Step callbacks.** At the end of every step, registered callbacks fire. This is where observability, memory writes, and checkpointing hook in — no monkey-patching required.

- **Multi-agent as managed agents.** Sub-agents are passed to an orchestrator as `managed_agents`. The orchestrator calls them like tools, with a task string. Sub-agents appear in the code namespace as callable functions.

- **Intentionally shallow abstractions.** The whole ReAct loop, memory serialization, and tool dispatch live in a single file. The design bet is that readability + forkability beats extensibility depth. Customization = fork, not plugin.

- **Code sandbox is NOT the default security boundary.** `LocalPythonExecutor` runs in-process. Production requires E2B / Docker / Pyodide. This is honest and documented — a lot of frameworks bury this.

---

## What soulforge can learn

- **Souls should declare their action format explicitly.** A soul that writes code-shaped actions and one that emits JSON tool calls behave very differently. The frontmatter could carry an `action_format: code | json | text` field — not enforced at runtime, but a clear contract for the agent's coding context.

- **The instructions/system_prompt duality maps cleanly to soulforge's soul structure.** A soul's `# Identity`, `# Voice`, and `# Values` sections are the stable system_prompt — they persist. Run-time task metadata (current user, date, workspace path) should be passed as `instructions`-equivalent context, not baked into the soul. Souls that hardcode task context become stale.

- **Planning interval belongs in the `planning:` frontmatter field.** Today soulforge uses `planning: scratchpad | explicit-schema`. A third value — `planning: interval` (with a `planning_interval_steps: N` field) — would document the periodic-reflection pattern for souls that run long multi-step loops.

- **Tool docstrings are first-class communication to the model, not developer notes.** smolagents' "building good agents" guide makes this explicit: every tool should log everything useful in its output, and the description/error messages should be written as if coaching a "dumb first-time user." This should be a named principle in soulforge's `tools/` README.

- **The agency-level taxonomy is a useful tool for soulforge's `.ai/` guidance.** When a coding agent reads `.ai/repo-map.json`, it would help to know "this soul is a level-4 multi-step agent" vs "this is a level-2 router." Adding an `agency_level` vocabulary to the soul schema would help coding agents pick the right neighboring examples.

---

## What soulforge should NOT copy

- **The "everything in one file" design.** 1,000 lines of `agents.py` is readable and forkable for a framework, but soulforge isn't a framework — it's a substrate. The primitives are already the right unit of modularity. Don't consolidate them.

- **The `InferenceClientModel` / LiteLLM hub abstraction.** smolagents wraps 100+ providers behind a single model interface. soulforge's soul schema is already provider-agnostic at the policy level. Coupling to a specific model adapter layer would fight the substrate's shape.

- **Treating sandbox as optional.** smolagents documents `LocalPythonExecutor` as "not a security sandbox" but still ships it as the out-of-the-box executor. For a production-agent substrate like soulforge, any tool that executes code should require an explicit sandbox declaration. Don't normalize unsandboxed execution as a starting point.

---

## Sources

- https://github.com/huggingface/smolagents
- https://huggingface.co/docs/smolagents/en/conceptual_guides/intro_agents
- https://huggingface.co/docs/smolagents/en/conceptual_guides/react
- https://huggingface.co/docs/smolagents/en/tutorials/building_good_agents
- https://huggingface.co/papers/2402.01030 (Executable Code Actions Elicit Better LLM Agents)
