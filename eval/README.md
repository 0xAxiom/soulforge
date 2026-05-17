# eval/

> **v1 placeholder.** No runnable code in this folder yet. This README is the design intent. v2 will land the actual harness.

If you are shipping an agent without eval, you are shipping a regression generator. The cost of not having eval is not "I have to test by hand" — it is "I cannot tell when my model upgrade made me dumber."

## What eval means here

| Layer        | Question it answers                                                  |
| ------------ | -------------------------------------------------------------------- |
| **Traces**   | What did the agent actually do on this conversation?                 |
| **Goldens**  | On these N curated inputs, does the agent produce the expected outputs? |
| **Scoring**  | When I change a soul / tool / model, is the new agent better or worse? |
| **Diffs**    | What specifically changed in agent behavior between version A and B? |

## Planned shape (v2)

```
eval/
├── traces/             ← capture every turn (input, tools called, output, cost)
├── goldens/            ← curated test cases, one folder per soul
├── score/              ← scoring functions (correctness, voice match, refusal alignment)
└── diff/               ← side-by-side comparison of two agent versions
```

## How it composes with souls

A soul that defines `refuses` in its frontmatter implicitly creates negative goldens: "given input that triggers a refusal condition, the agent should refuse." Eval can read the soul, generate these goldens, and run them automatically.

This is the bet: souls + eval reinforce each other. The soul declares intent; eval verifies the intent holds across changes.

## Design decisions (settled by research)

These were open questions. DSPy's architecture — specifically its trace collection, metric composition, and optimizer loop — provided concrete answers worth committing to before v2 code lands.

**1. Trace format → custom JSONL, content-addressed cache.**
Custom JSONL wins. One record per agent turn: `{id, soul_version, input, tools_called, output, cost_usd, duration_ms, metric_passed}`. No OTel overhead for v2; add an OTel adapter only if a downstream consumer (e.g. Grafana) requires it. Cache trace results by `sha256(soul_version + input)` so re-running the same golden against an unchanged soul is a cache hit, not a new LLM call.

**2. Scoring rubric → tiered by certainty, not a single strategy.**
Use three tiers matched to output type:
- **Hard assertions** for refusal conditions (deterministic). If `refuses` in the soul frontmatter matches the input, the agent must refuse — no LM judgment needed. A plain string-match or regex on the output is enough.
- **Exact / semantic match** for structured outputs (tool call names, JSON field values). These are factual and shouldn't require a judge.
- **LLM-as-judge** for voice, tone, and open-ended reasoning quality. The judge is a separate LM call with its own system prompt specifying the soul's voice criteria. Rate: 1 judge call per golden, not per turn.

Scoring functions are typed `(example: Golden, output: string) => Pass | Fail | Score`. A golden can declare which tier applies.

**3. Golden generation → hand-curated first, trace-bootstrapped second.**
Don't generate synthetic goldens until real agent traces exist. The right sequence: ship an agent → capture 20-50 real turns → filter turns where the output was good → promote them to goldens. This is DSPy's BootstrapFewShot insight applied to golden curation: behavioral evidence beats synthetic edge cases for the first 50 goldens. Synthetic generation for adversarial/edge cases comes after the baseline is stable.

**4. Cost in the loop → parallel runs + nightly CI, never per-PR.**
Run goldens in parallel (configurable concurrency, default 5). Cap per-run cost with a `--budget-usd` flag that halts early if exceeded. Schedule nightly, not per-PR. Per-PR eval is reserved for a smoke subset: ≤10 goldens, cheapest model, hard assertions only. This matches DSPy's evaluation design: `dspy.Evaluate` parallelizes with configurable workers and the expensive optimization runs are scheduled, not gated on every commit.

## Trace-to-soul feedback loop

Eval traces are not just test artifacts — they are the raw material for soul improvement. The loop:

```
1. Agent runs → traces captured in eval/traces/
2. Filter traces where metric_passed = false
3. Inspect failures: is it the soul, the tool, or the model?
4. If soul: edit soul.md, bump version, re-run goldens
5. If tool: fix tool contract, re-run
6. If model: note regression, flag for model upgrade decision
```

This is the soulforge equivalent of DSPy's optimizer loop — but human-driven, because soulforge's bet is that soul edits stay human-authored. The traces just make the evidence visible.

## Why this is a stub today

Same reason as `memory/`: eval shaped without a real agent to evaluate produces academically clean code that solves the wrong problems. Ship one agent, then design eval from the regressions that actually bit.
