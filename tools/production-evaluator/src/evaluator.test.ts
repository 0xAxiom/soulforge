import { describe, it, expect } from "vitest";
import {
  ProductionEvaluatorRunner,
  lengthSignal,
  refusalDetector,
  keywordExtractor,
  latencySignal,
  type TurnContext,
  type ExtractedFact,
} from "./index.js";

function makeTurn(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    input: "What is the best chain for DeFi?",
    output: "Base is the best chain for DeFi because of its low fees.",
    session_id: "test-session-1",
    turn_id: "turn-001",
    completed_at: "2026-05-30T14:00:00.000Z",
    ...overrides,
  };
}

// ─── lengthSignal ──────────────────────────────────────────────────────────

describe("lengthSignal", () => {
  it("emits output_length_chars signal", async () => {
    const turn = makeTurn({ output: "short reply" });
    const result = await lengthSignal.run(turn);
    expect(result.signals).toBeDefined();
    const sig = result.signals?.find((s) => s.name === "output_length_chars");
    expect(sig).toBeDefined();
    expect(sig?.value).toBe("short reply".length);
  });

  it("classifies short output as 'short'", async () => {
    const turn = makeTurn({ output: "ok" });
    const result = await lengthSignal.run(turn);
    const fact = result.facts?.[0];
    expect(fact?.value).toBe("short");
  });

  it("classifies long output as 'long'", async () => {
    const turn = makeTurn({ output: "a".repeat(900) });
    const result = await lengthSignal.run(turn);
    const fact = result.facts?.[0];
    expect(fact?.value).toBe("long");
  });

  it("attaches correct session_id and turn_id to fact", async () => {
    const turn = makeTurn();
    const result = await lengthSignal.run(turn);
    const fact = result.facts?.[0];
    expect(fact?.session_id).toBe("test-session-1");
    expect(fact?.turn_id).toBe("turn-001");
  });
});

// ─── refusalDetector ──────────────────────────────────────────────────────

describe("refusalDetector", () => {
  it("does not detect refusal in normal output", async () => {
    const turn = makeTurn({ output: "Here is the answer to your question." });
    const result = await refusalDetector.run(turn);
    const sig = result.signals?.find((s) => s.name === "refusal_detected");
    expect(sig?.value).toBe(false);
    expect(result.facts).toBeUndefined();
  });

  it("detects 'I cannot' refusal", async () => {
    const turn = makeTurn({ output: "I cannot help with that request." });
    const result = await refusalDetector.run(turn);
    const sig = result.signals?.find((s) => s.name === "refusal_detected");
    expect(sig?.value).toBe(true);
    expect(result.facts?.length).toBeGreaterThan(0);
    const fact = result.facts?.[0];
    expect(fact?.key).toBe("session.refusal_observed");
    expect(fact?.value).toBe(true);
  });

  it("detects case-insensitive 'I WILL NOT'", async () => {
    const turn = makeTurn({ output: "I WILL NOT do that." });
    const result = await refusalDetector.run(turn);
    const sig = result.signals?.find((s) => s.name === "refusal_detected");
    expect(sig?.value).toBe(true);
  });
});

// ─── keywordExtractor ──────────────────────────────────────────────────────

describe("keywordExtractor", () => {
  const chainEval = keywordExtractor("chain-pref", {
    "user.prefers_base": ["base", "base chain"],
    "user.prefers_ethereum": ["ethereum", "mainnet"],
  });

  it("extracts a matching category", async () => {
    const turn = makeTurn({ output: "I recommend the base chain for DeFi." });
    const result = await chainEval.run(turn);
    const fact = result.facts?.find((f) => f.key === "user.prefers_base");
    expect(fact).toBeDefined();
    expect(fact?.confidence).toBeGreaterThan(0.5);
  });

  it("does not emit a fact when no keyword matches", async () => {
    const turn = makeTurn({ output: "Solana has low fees too." });
    const result = await chainEval.run(turn);
    expect(result.facts?.length ?? 0).toBe(0);
  });

  it("matches keywords in input as well as output", async () => {
    const turn = makeTurn({
      input: "What is mainnet good for?",
      output: "It has high security.",
    });
    const result = await chainEval.run(turn);
    const fact = result.facts?.find((f) => f.key === "user.prefers_ethereum");
    expect(fact).toBeDefined();
  });
});

// ─── latencySignal ──────────────────────────────────────────────────────────

describe("latencySignal", () => {
  const latency = latencySignal(3000);

  it("returns empty output when latency_ms is absent", async () => {
    const result = await latency.run(makeTurn());
    expect(result.signals).toBeUndefined();
    expect(result.facts).toBeUndefined();
  });

  it("emits latency_ms signal when latency present", async () => {
    const turn = makeTurn({ latency_ms: 1200 });
    const result = await latency.run(turn);
    const sig = result.signals?.find((s) => s.name === "latency_ms");
    expect(sig?.value).toBe(1200);
    expect(result.facts?.length ?? 0).toBe(0);
  });

  it("emits high_latency fact when above threshold", async () => {
    const turn = makeTurn({ latency_ms: 4500 });
    const result = await latency.run(turn);
    const fact = result.facts?.[0];
    expect(fact?.key).toBe("session.high_latency_observed");
    expect(fact?.value).toBe(4500);
  });
});

// ─── ProductionEvaluatorRunner ─────────────────────────────────────────────

describe("ProductionEvaluatorRunner", () => {
  it("runs all evaluators and aggregates facts and signals", async () => {
    const runner = new ProductionEvaluatorRunner([lengthSignal, refusalDetector]);
    const result = await runner.afterTurn(makeTurn({ output: "I cannot do that." }));
    expect(result.evaluator_count).toBe(2);
    expect(result.facts_extracted).toBeGreaterThan(0);
    expect(result.signals_emitted).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it("accumulates facts in session store", async () => {
    const runner = new ProductionEvaluatorRunner([lengthSignal]);
    await runner.afterTurn(makeTurn({ turn_id: "t1" }));
    await runner.afterTurn(makeTurn({ turn_id: "t2" }));
    const facts = runner.getFactsForSession("test-session-1");
    expect(facts.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty facts for unknown session", () => {
    const runner = new ProductionEvaluatorRunner([]);
    expect(runner.getFactsForSession("no-such-session")).toEqual([]);
  });

  it("calls onFact hook for each extracted fact", async () => {
    const captured: ExtractedFact[] = [];
    const runner = new ProductionEvaluatorRunner([lengthSignal], {
      onFact: (f) => { captured.push(f); },
    });
    await runner.afterTurn(makeTurn());
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]?.source_evaluator).toBe("length-signal");
  });

  it("isolates facts by session_id", async () => {
    const runner = new ProductionEvaluatorRunner([lengthSignal]);
    await runner.afterTurn(makeTurn({ session_id: "session-A" }));
    await runner.afterTurn(makeTurn({ session_id: "session-B" }));
    expect(runner.getFactsForSession("session-A").length).toBeGreaterThan(0);
    expect(runner.getFactsForSession("session-B").length).toBeGreaterThan(0);
    const aFact = runner.getFactsForSession("session-A")[0];
    expect(aFact?.session_id).toBe("session-A");
  });

  it("catches and records evaluator errors without throwing", async () => {
    const badEval = {
      name: "bad-evaluator",
      description: "always throws",
      async run(): Promise<never> {
        throw new Error("intentional failure");
      },
    };
    const runner = new ProductionEvaluatorRunner([badEval]);
    const result = await runner.afterTurn(makeTurn());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.name).toBe("bad-evaluator");
    expect(result.errors[0]?.error).toMatch("intentional failure");
  });

  it("clearSession removes facts from store", async () => {
    const runner = new ProductionEvaluatorRunner([lengthSignal]);
    await runner.afterTurn(makeTurn());
    expect(runner.getFactsForSession("test-session-1").length).toBeGreaterThan(0);
    runner.clearSession("test-session-1");
    expect(runner.getFactsForSession("test-session-1")).toHaveLength(0);
  });
});
