# tools/production-evaluator/

In-production post-response evaluators. Distinct from offline eval (`eval/`): these run after every real agent response turn to extract facts and quality signals that feed back into memory.

## Why this exists

`eval/` is for offline golden-replay testing — you assert against known outputs before deploying. Production evaluators are a different primitive: they run **in production, after every real turn**, to extract persistent facts ("user prefers Base") and quality signals (response length, refusals, latency spikes). This distinction is named in ElizaOS's architecture (`research/2026-05-26-elizaos.md`) and was missing from soulforge until now.

The rule: production evaluators must be **synchronous heuristics**, not LLM calls. If you need LLM-as-judge in production, run it as a background observability task — not inline in the response path.

## Usage

```ts
import {
  ProductionEvaluatorRunner,
  lengthSignal,
  refusalDetector,
  keywordExtractor,
  latencySignal,
} from "./tools/production-evaluator/src/index.js";

const runner = new ProductionEvaluatorRunner(
  [lengthSignal, refusalDetector, latencySignal(5000)],
  {
    // Optional: stream facts to persistent memory
    onFact: (fact) => myLongTermMemoryStore.set(fact.key, fact.value, { ... }),
  }
);

// After every agent response turn:
const result = await runner.afterTurn({
  input: userMessage,
  output: agentResponse,
  session_id: "abc123",
  turn_id: "abc123-1",
  completed_at: new Date().toISOString(),
  latency_ms: 1200,
});

// Read facts accumulated in this session:
const facts = runner.getFactsForSession("abc123");
```

## Built-in evaluators

| Export | What it does |
| --- | --- |
| `lengthSignal` | Emits `output_length_chars` signal + `session.last_response_brevity` fact (`"short"` / `"medium"` / `"long"`). |
| `refusalDetector` | Detects standard refusal phrases. Emits `refusal_detected` signal + `session.refusal_observed` fact on match. |
| `keywordExtractor(name, categories)` | Factory. Matches keywords in input+output, emits per-category facts with confidence scores. |
| `latencySignal(thresholdMs)` | Emits `latency_ms` signal. Emits `session.high_latency_observed` fact when latency exceeds threshold. |

## Custom evaluators

```ts
import type { ProductionEvaluatorDef } from "./tools/production-evaluator/src/index.js";

const myEvaluator: ProductionEvaluatorDef = {
  name: "my-evaluator",
  description: "Extracts something specific from the output.",
  async run(ctx) {
    // ctx: { input, output, session_id, turn_id, completed_at, latency_ms?, metadata? }
    return {
      facts: [{ key: "my.fact", value: "extracted", confidence: 0.8, ... }],
      signals: [{ name: "my_signal", value: 42, source_evaluator: "my-evaluator" }],
    };
  },
};
```

Evaluators must NOT throw — return `{}` on unexpected input. The runner catches and records errors without crashing the turn.

## Integration with memory/

Production evaluators are the bridge between agent turns and long-term memory. The `onFact` hook is the seam:

```ts
import { LongTermMemoryStore } from "../../memory/src/index.js";

const store = new LongTermMemoryStore(dbPath);
const runner = new ProductionEvaluatorRunner([...evaluators], {
  onFact: async (fact) => {
    await store.set(`prod-eval:${fact.key}`, fact.value, {
      tags: ["production-evaluator", fact.source_evaluator],
      provenance: { session_id: fact.session_id, turn_id: fact.turn_id },
    });
  },
});
```

## Run the example

```bash
npx tsx tools/production-evaluator/examples/basic.ts
```

## Test

```bash
npm run test -- production-evaluator
```
