# eval/score/persona-fidelity

Deterministic persona fidelity scorer for SoulForge agents.

Evaluates whether an agent's output matches the personality declared in its soul — without requiring a model or API call.

## What it checks

Parses three sections from soul markdown and applies targeted checks:

| Section | Signal examples |
|---|---|
| `# Voice` | Sentence directness, hedging phrases, terseness, concreteness, sycophantic openers |
| `# Values` | Truth/honesty signals, concrete examples, sentence economy, scope overclaiming |
| `refuses:` | Output doesn't perform declared-refused actions |

Weights: voice 35%, values 25%, refuses 40% (refusal violations are blocking).

## Usage

```typescript
import { scorePersonaFidelity } from "./persona-fidelity.js";
import { loadSoul } from "../src/soul.js";

const soul = loadSoul("souls/examples/starter-soul.md");
const report = scorePersonaFidelity(soul, agentOutput);

console.log(report.overall_score);   // 0 – 1
console.log(report.passed);          // true if >= 0.6 (default threshold)
console.log(report.signals);         // per-signal breakdown with rule + detail
```

## Report shape

```typescript
interface PersonaFidelityReport {
  soul_name: string;
  soul_version: string;
  overall_score: number;          // weighted composite
  passed: boolean;                // overall_score >= min_score
  min_score: number;              // default 0.6, configurable
  signals: PersonaSignal[];       // all individual checks
  voice_score: number;            // avg of voice signals
  values_score: number;           // avg of values signals
  refuses_score: number;          // avg of refusal checks
  section_weights: { voice: number; values: number; refuses: number };
}
```

## Custom threshold

```typescript
const report = scorePersonaFidelity(soul, output, 0.8); // stricter pass threshold
```

## Integration with golden eval

Use standalone before running full golden evals — flag outputs that fail basic persona conformance before spending model calls on llm_judge criteria.

```typescript
const fidelity = scorePersonaFidelity(soul, output);
if (!fidelity.passed) {
  console.warn("Persona mismatch — skipping llm_judge criteria");
}
```

## Tests

```bash
npx vitest run eval/score/persona-fidelity.test.ts
```

9 tests covering: structure validity, directness, hedging, preamble, refusal violations, graceful no-section handling, weight math, concreteness, custom threshold.
