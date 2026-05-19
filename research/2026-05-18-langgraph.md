# LangGraph — Graph-Shaped State Machines with First-Class Human Interrupts

**Target:** LangGraph by LangChain
- GitHub: https://github.com/langchain-ai/langgraph
- Docs: https://langchain-ai.github.io/langgraph/concepts/

---

## What it is

LangGraph is a low-level orchestration runtime for agent workflows, modeled as directed graphs where nodes are processing units and edges are conditional transitions. Inspired by Google's Pregel bulk-synchronous-parallel model, it treats execution as discrete super-steps: all eligible nodes run (possibly in parallel) before progressing. Persistence is not a feature — it is the foundation everything else (human-in-the-loop, time travel, fault recovery) is built on.

---

## Architecture

- **State as typed dict.** All nodes share a single TypedDict or Pydantic model. Nodes receive the full state, return partial updates, and the framework merges using declared operators (add, replace, override). Serializable by design — required for checkpointing.

- **Super-step checkpoints.** State is snapshotted at synchronization barriers after each super-step completes. These are the only replayable recovery points. "Time travel" = loading an earlier checkpoint and running forward from there.

- **Pending writes recovery.** Within a super-step, node outputs are persisted as they complete. If node B fails in a super-step where node A already succeeded, resuming doesn't re-run A. This is rare among agent frameworks and genuinely solves production retry storms.

- **Dynamic interrupts.** Call `interrupt(payload)` anywhere inside a node — not as a static breakpoint declared before execution, but as a runtime signal. The framework snapshots state and pauses indefinitely. Resume with `Command(resume=value)`. The payload surfaces to the caller for approval workflows, editing, validation.

  Caveat: resuming replays the entire node containing the interrupt from the beginning, so any code before the interrupt re-runs. This is a hidden footgun if that code has side effects.

- **Subgraphs as first-class units.** A node can invoke another full graph. State flows across boundaries using the same update operators. Enables hierarchical multi-agent composition.

- **Durability modes (exit/async/sync).** Controls when writes are flushed. `async` is the recommended balance: writes happen in parallel with the next super-step. `exit` is fastest but loses in-progress work on crash.

- **Streaming at node level.** `stream()` / `astream()` emit state updates per-node completion. Token-level streaming is delegated to the LLM provider — LangGraph doesn't try to own that layer.

---

## What soulforge can learn

**1. Pending writes recovery should be named explicitly in ARCHITECTURE.md.**
Soulforge already says "checkpoint after every step." LangGraph makes a finer point: completed steps within a batch must not re-run even when a sibling step fails. For soulforge's deterministic-workflow-soul, this means: a step receipt is an idempotency record, not just a log — resuming from a checkpoint means skipping all steps whose receipts already exist.

**2. The approval-gate soul pattern.**
LangGraph's `interrupt(payload)` is cleanly transferable to soulforge. A soul should be able to declare named pause points, surface a structured payload to the user (what they're deciding), and resume with the user's decision injected into the handoff record. This is distinct from the deterministic-workflow soul — that soul is about typed machine-to-machine handoffs; this soul is specifically about human-in-the-loop decision points. See `souls/examples/approval-gate-soul.md`.

**3. Typed state prevents subgraph drift.**
LangGraph's hardest multi-agent debugging problem is schema drift when a subgraph's output shape changes silently. Soulforge's principle of typed handoff records is the right defense — but it should be stated explicitly as a multi-agent concern, not just a single-pipeline concern.

---

## What soulforge should NOT copy

- **Thread ID as persistent cursor.** LangGraph reuses `thread_id` to resume state, conflating stateless HTTP identity with stateful workflow identity. This is unintuitive and creates naming friction. Soulforge's approach of explicit checkpoint files is cleaner.

- **Node-replay on interrupt resume.** Re-running a node from the beginning when resuming after an interrupt is a footgun. Soulforge's interrupt-equivalent should require that any code before the pause point is idempotent, OR that the pause is at the very end of the node's logic (after all side effects).

- **Version divergence (v1 / v2 execution modes).** A signal that graph execution semantics were retrofitted, not designed. Soulforge should keep execution semantics in the soul's declared planning mode, not in a runtime version flag.

- **Mandatory LangSmith for multi-agent visibility.** LangGraph's subgraph debugging is degraded without LangSmith. Soulforge's observability layer (append-only JSONL) should be sufficient for tracing without a vendor dependency.

---

## Sources

- https://github.com/langchain-ai/langgraph (README and architecture)
- https://langchain-ai.github.io/langgraph/concepts/ (conceptual docs)
- LangGraph persistence design: https://langchain-ai.github.io/langgraph/concepts/persistence/
- LangGraph human-in-the-loop: https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/
