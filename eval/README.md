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

## Open design questions

1. **Trace format.** OTel? Custom JSONL? LangSmith export-compatible? Probably custom JSONL with an OTel adapter.
2. **Scoring rubric.** LLM-as-judge with another model? Hand-written assertions? Both?
3. **Golden generation.** Hand-curated only, or augmented with model-generated edge cases? The latter scales but quality varies.
4. **Cost in the loop.** Running 100 goldens against Claude Sonnet per CI run gets expensive. Cache aggressively? Run nightly instead of per-PR?

## Why this is a stub today

Same reason as `memory/`: eval shaped without a real agent to evaluate produces academically clean code that solves the wrong problems. Ship one agent, then design eval from the regressions that actually bit.
