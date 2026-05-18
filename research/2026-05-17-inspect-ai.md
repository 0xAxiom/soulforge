# Inspect AI

**Target** — UK AI Security Institute / Meridian Labs eval framework
- Docs: https://inspect.aisi.org.uk/
- Repo: https://github.com/UKGovernmentBEIS/inspect_ai

## What it is

Inspect AI is Python-based eval infrastructure built by the UK AI Security Institute for rigorous frontier-model evaluation. It ships a compositional pipeline — Dataset + Solver + Scorer assembled into a Task — that runs against any supported model provider. Unlike most eval libraries it was designed explicitly for agentic evals (multi-step, tool-use, sandboxed execution), not just static QA benchmarks.

## Architecture

- **Task = Dataset × Solver × Scorer**: the three are independently swappable. A Task bundles them into a named, parameterizable evaluation unit.
- **TaskState as the state machine**: every Solver is a pure transform `(TaskState, generate) → TaskState`. The state carries message history, output, and metadata. Composition is just sequential application — a `chain()` of solvers runs in order; complex agents are a solver that loops internally.
- **Deferred scoring**: `inspect eval --no-score` generates outputs; `inspect score` scores them later. Generation and scoring are separate stages with separate cost profiles. Cache the expensive generation step, re-run cheap scoring as rubrics evolve.
- **Epochs with reducers**: `Epochs(count=N, reducer="mean"|"median"|"mode")` runs each golden N times and folds the results. This is the correct answer to stochastic LLM variance — not "run once and hope."
- **Model-graded scorers with rubric templates**: grader templates accept `{question}`, `{answer}`, `{criterion}`, `{instructions}` variables. Majority voting across multiple grader models is built in. The grader model can be different from the eval model.
- **Agents as narrow-interface solvers**: agents expose the same `(TaskState, generate)` interface as solvers. A single agent can be a top-level solver, a delegated subagent, or a tool — same code, different mounting point.
- **`handoff()` for multi-agent**: passes full conversation history to the next agent, not a summary. Continuity is explicit, not implicit.
- **Sandbox-first for agentic tasks**: Docker/Kubernetes sandboxes for untrusted code execution are first-class, not bolted on. The sandbox lifecycle is tied to the Task lifecycle.

## What soulforge can learn

- **Epoch reduction belongs in eval/score/**: soulforge runs each golden once. That's fine for deterministic golden-replay but wrong for real LLM-backed scoring. Add `epochReduce(runs, reducer)` — take N runs of `EvalResult[]` and fold to one. Soulforge already has `mean`/`median` math nearby.
- **Deferred scoring pattern is real**: soulforge's cache already separates output generation from scoring implicitly (cache stores the output, scorer re-runs on each call). Expose this explicitly — let `runEval` accept a `scoreOnly` flag that re-scores cached outputs without re-running the soul. Useful when refining rubrics.
- **Rubric templates in llm_judge**: the `DeterministicJudgeModel` currently extracts keywords from rubric text. A real LLM judge call needs a structured prompt template with `{criterion}`, `{output}`, `{soul_context}` slots — so the rubric stays human-readable but the prompt is reproducible.
- **Multiple scorers on one golden returning dict values**: Inspect lets a scorer return `Score(value={"precision": 0.9, "recall": 0.8})` to share one expensive model call across metrics. Soulforge criteria are already per-criterion, so the analog is a single `llm_judge` criterion that returns multiple `ScoreDetail` entries — one per sub-rubric facet.

## What soulforge should NOT copy

- **Python + decorator machinery** (`@task`, `@solver`, `@scorer`): soulforge is TypeScript and explicitly not a framework runtime. The decorator pattern is ergonomic for Python but adds framework weight that conflicts with soulforge's "no runtime" bet.
- **Sandbox management** (Docker/k8s lifecycle hooks): soulforge doesn't execute agent code directly — it evaluates soul policy documents. Code execution belongs in the agent's deployment, not the eval harness.
- **Web viewer + VS Code extension**: heavy tooling built around Inspect's own proprietary log format. Soulforge's JSONL trace format is its own surface; a viewer should read that, not Inspect's format.
- **`generate_loop()` / ReAct scaffolding built into the eval harness**: putting agent scaffolding inside the eval runner conflates "how do we run the agent" with "how do we evaluate it." Soulforge correctly keeps these separate — the soul describes policy, the golden tests the policy, the runner is dumb.

## Sources

- https://inspect.aisi.org.uk/
- https://inspect.aisi.org.uk/tasks.html
- https://inspect.aisi.org.uk/solvers.html
- https://inspect.aisi.org.uk/scorers.html
- https://inspect.aisi.org.uk/agents.html
- https://github.com/UKGovernmentBEIS/inspect_ai
