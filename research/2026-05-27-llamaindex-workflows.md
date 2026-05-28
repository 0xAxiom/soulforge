# LlamaIndex Workflows — Type-Declared Step Routing

**Target:** LlamaIndex Workflows 1.0 — https://www.llamaindex.ai/blog/announcing-workflows-1-0-a-lightweight-framework-for-agentic-systems | https://github.com/run-llama/workflows-py

## What it is

LlamaIndex Workflows is an event-driven, async-first Python framework for composing multi-step LLM applications. Workflows are made of `@step`-decorated async functions that consume and emit typed Pydantic events; the framework infers the routing graph from the function type signatures automatically. There is no explicit dispatch table — routing is a property of the types.

## Architecture

- **Type-inferred routing.** Steps are Python callables annotated with typed inputs and outputs (`async def greet(self, ev: StartEvent) -> StopEvent`). The workflow engine scans all `@step` methods, reads their type signatures, and builds the event routing graph at startup. Adding a new step requires no change to any routing config — the type signature *is* the registration.
- **Two boundary events.** `StartEvent` and `StopEvent` are framework-provided. All other events are user-defined Pydantic models. This forces the pipeline's I/O contract to be explicit at both ends while the interior is flexible.
- **Plain Python control flow.** Loops and branches are written as normal Python conditionals and loops inside steps, not encoded as graph edges. LlamaIndex explicitly identifies DAG-edge encoding of branches as the failure mode in graph frameworks (LangGraph being the implied target).
- **WorkflowCheckpointer.** An explicit checkpointing API separate from the workflow class. After each step completes, the runner can serialize the step's output event to disk. On failure, the next run resumes from the last checkpoint, re-running only the failed step forward. The workflow code itself does not change.
- **Deployment spectrum.** The same workflow class runs as: in-process library call, REST API server (via `llama-agents-server`), or distributed service (via `llama-deploy` with a control plane and per-workflow message queues). No code rewrite required — only the runner changes.
- **Optional observability.** `llama-index-instrumentation` adds OpenTelemetry traces to every step call without modifying step code. Same pattern as filter souls — orthogonal intercept layer.

## What soulforge can learn

- **Type-declared step contracts.** Soulforge souls already have a `# Tools` section and output schemas. But they don't declare their *input event types* separately from their prose description. A soul could declare `input_event_types` and `output_event_types` in frontmatter — enough for an orchestrator to auto-wire it without reading the prose. This would make soulforge's pipeline composition as discoverable as LlamaIndex's type routing. The concrete form: add `input_event_types` and `output_event_types` to the soul frontmatter spec (optional fields, not required).
- **WorkflowCheckpointer as a pattern name.** Soulforge's `deterministic-workflow-soul.md` already says "checkpoint after every step," but does not give the pattern a name or show what the checkpoint record looks like as a concrete schema. LlamaIndex's WorkflowCheckpointer shows the minimal checkpoint: `{ step_name, output_event_type, output_event_payload, completed_at }`. Adding this to the deterministic workflow soul's memory section would be a direct upgrade.
- **StartEvent / StopEvent convention.** Soulforge workflows use "typed handoff records" between steps, but the entry and exit events are unnamed. Naming the boundary events explicitly (even in prose) improves readability and gives eval harnesses a clear attach point.

## What soulforge should NOT copy

- **Python-only type routing.** The automatic type-inference trick requires a Python class model. Soulforge souls are language-agnostic markdown; the routing layer is the orchestrator (human, coding agent, or runner). Don't try to replicate `@step` decorator magic in JSON schema — it would just be YAML with extra steps.
- **llama-deploy control plane.** The distributed deployment story (control plane + per-workflow queues) is deeply tied to LlamaIndex's specific deployment target (document processing pipelines at scale). Soulforge's deployment primitive is endpoint stubs — the scale is different.
- **Framework coupling.** LlamaIndex Workflows works best when you also use LlamaIndex's RAG primitives (query engines, data connectors). The orchestration layer is technically separable (`pip install llama-index-workflows`) but the docs and examples assume the full stack. Soulforge's value is provider-agnostic; don't introduce a LlamaIndex import as the default tool chain.

## Sources

- https://www.llamaindex.ai/blog/announcing-workflows-1-0-a-lightweight-framework-for-agentic-systems
- https://github.com/run-llama/workflows-py
- https://developers.llamaindex.ai/python/llamaagents/workflows/
- https://www.dataleadsfuture.com/deep-diving-into-llamaindex-workflow-event-driven-llm-architecture/
