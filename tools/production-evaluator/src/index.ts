/**
 * tools/production-evaluator — in-production post-response evaluators.
 *
 * Distinct from offline eval (eval/): these run after every real agent
 * response turn to extract facts and quality signals that feed back into
 * memory. Pattern sourced from ElizaOS (research/2026-05-26-elizaos.md):
 * Evaluators are post-response analyzers that extract facts, update
 * long-term memory, and track goal progress. They run in production,
 * not in a test harness.
 *
 * Caller flow:
 *   1. Create a ProductionEvaluatorRunner with one or more evaluator defs.
 *   2. After each agent response, call runner.afterTurn(context).
 *   3. Inspect runner.getFactsForSession(sessionId) or use the onFact hook
 *      to stream facts into a LongTermMemoryStore or similar.
 */

// ─── Core types ──────────────────────────────────────────────────────────────

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

/**
 * The context passed to each evaluator after a single agent response turn.
 */
export interface TurnContext {
  /** Full text of the user input for this turn. */
  readonly input: string;
  /** Full text of the agent output for this turn. */
  readonly output: string;
  /** Stable session identifier (groups turns in a conversation). */
  readonly session_id: string;
  /** Stable per-turn identifier. */
  readonly turn_id: string;
  /** ISO timestamp when the turn completed. */
  readonly completed_at: string;
  /** Optional: wall-clock latency of the agent response in ms. */
  readonly latency_ms?: number | undefined;
  /** Optional: extra metadata the caller wants evaluators to see. */
  readonly metadata?: JsonObject | undefined;
}

/**
 * A fact extracted from a turn — suitable for persisting to long-term memory.
 * Facts are structured claims about the session, user, or world that are worth
 * retaining across future turns.
 *
 * Examples:
 *   { key: "user.preferred_chain", value: "base", confidence: 0.9 }
 *   { key: "session.topic", value: "swapping tokens", confidence: 0.7 }
 */
export interface ExtractedFact {
  /** Dotted key identifying the fact (e.g. "user.preferred_chain"). */
  readonly key: string;
  /** The fact value. May be a string, number, boolean, or structured object. */
  readonly value: JsonValue;
  /** Confidence in [0, 1]. Evaluators are expected to be conservative here. */
  readonly confidence: number;
  /** Which evaluator produced this fact. */
  readonly source_evaluator: string;
  /** Turn context provenance. */
  readonly session_id: string;
  readonly turn_id: string;
  readonly extracted_at: string;
}

/**
 * A quality signal from a turn — suitable for observability dashboards,
 * cost tracking, or adaptive routing. Signals are NOT stored as facts;
 * they are ephemeral measurements.
 *
 * Examples:
 *   { name: "output_length", value: 342 }
 *   { name: "refusal_detected", value: true }
 *   { name: "tool_calls", value: ["search", "summarize"] }
 */
export interface EvalSignal {
  readonly name: string;
  readonly value: JsonValue;
  readonly source_evaluator: string;
}

/**
 * What a single evaluator run returns. Both fields are optional — an evaluator
 * may produce only facts, only signals, or both.
 */
export interface EvaluationOutput {
  readonly facts?: readonly ExtractedFact[] | undefined;
  readonly signals?: readonly EvalSignal[] | undefined;
}

/**
 * A named evaluator that runs after each turn. Evaluators are synchronous
 * rule-evaluators or lightweight heuristics; they must NOT be LLM calls
 * (those belong in offline eval with judge scorers). If you need LLM-as-judge
 * in production, run it as a background observability task, not inline.
 */
export interface ProductionEvaluatorDef {
  /** Unique name for this evaluator. Used in fact provenance and signal names. */
  readonly name: string;
  /** Human-readable description of what this evaluator extracts. */
  readonly description: string;
  /**
   * Run the evaluator against one completed turn. Return facts and/or signals.
   * May return an empty object if nothing actionable was found.
   * Must NOT throw — return {} on unexpected input rather than throwing.
   */
  readonly run: (ctx: TurnContext) => Promise<EvaluationOutput>;
}

// ─── Runner result ────────────────────────────────────────────────────────────

export interface TurnEvalResult {
  readonly session_id: string;
  readonly turn_id: string;
  readonly evaluator_count: number;
  readonly facts_extracted: number;
  readonly signals_emitted: number;
  readonly facts: readonly ExtractedFact[];
  readonly signals: readonly EvalSignal[];
  /** Evaluators that threw unexpectedly (name → error message). */
  readonly errors: readonly { readonly name: string; readonly error: string }[];
  readonly wall_time_ms: number;
}

// ─── Fact store ──────────────────────────────────────────────────────────────

/**
 * Optional hook for callers who want to stream facts to external storage
 * (e.g. LongTermMemoryStore) without hard-wiring a dependency here.
 */
export type OnFactHook = (fact: ExtractedFact) => void | Promise<void>;

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * ProductionEvaluatorRunner — registers evaluator defs and runs them after
 * each agent turn. Maintains an in-process session fact store so callers can
 * read back extracted facts without needing a separate DB for quick access.
 *
 * For persistent storage, pass an `onFact` hook that writes to a
 * LongTermMemoryStore or appends to JSONL.
 *
 * @example
 * ```ts
 * const runner = new ProductionEvaluatorRunner(
 *   [refusalDetector, lengthSignal],
 *   { onFact: (fact) => myMemoryStore.set(fact.key, fact.value, ...) }
 * );
 *
 * // After each response turn:
 * const result = await runner.afterTurn({
 *   input: userMessage,
 *   output: agentResponse,
 *   session_id: "abc123",
 *   turn_id: `abc123-${Date.now()}`,
 *   completed_at: new Date().toISOString(),
 * });
 * ```
 */
export class ProductionEvaluatorRunner {
  private readonly evaluators: readonly ProductionEvaluatorDef[];
  private readonly onFact: OnFactHook | undefined;
  private readonly sessionFacts: Map<string, ExtractedFact[]> = new Map();

  constructor(
    evaluators: readonly ProductionEvaluatorDef[],
    options?: { onFact?: OnFactHook | undefined }
  ) {
    this.evaluators = evaluators;
    this.onFact = options?.onFact;
  }

  /**
   * Run all registered evaluators against a completed turn. Returns a
   * TurnEvalResult with all extracted facts and signals. Also fires the
   * onFact hook for each fact (awaited sequentially so callers can do async
   * memory writes without losing ordering).
   */
  async afterTurn(ctx: TurnContext): Promise<TurnEvalResult> {
    const started = performance.now();
    const allFacts: ExtractedFact[] = [];
    const allSignals: EvalSignal[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const evaluator of this.evaluators) {
      try {
        const output = await evaluator.run(ctx);
        if (output.facts) {
          for (const fact of output.facts) {
            allFacts.push(fact);
            if (this.onFact) {
              await this.onFact(fact);
            }
          }
        }
        if (output.signals) {
          for (const signal of output.signals) {
            allSignals.push(signal);
          }
        }
      } catch (err) {
        errors.push({
          name: evaluator.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Persist to session store
    if (!this.sessionFacts.has(ctx.session_id)) {
      this.sessionFacts.set(ctx.session_id, []);
    }
    const existing = this.sessionFacts.get(ctx.session_id);
    if (existing !== undefined) {
      existing.push(...allFacts);
    }

    return {
      session_id: ctx.session_id,
      turn_id: ctx.turn_id,
      evaluator_count: this.evaluators.length,
      facts_extracted: allFacts.length,
      signals_emitted: allSignals.length,
      facts: allFacts,
      signals: allSignals,
      errors,
      wall_time_ms: Math.round(performance.now() - started),
    };
  }

  /**
   * Return all facts extracted so far for a session (in extraction order).
   * Returns an empty array if the session has no recorded facts.
   */
  getFactsForSession(sessionId: string): readonly ExtractedFact[] {
    return this.sessionFacts.get(sessionId) ?? [];
  }

  /**
   * Clear the in-process fact store for a session (e.g. after writing to
   * persistent storage). Does not affect external storage.
   */
  clearSession(sessionId: string): void {
    this.sessionFacts.delete(sessionId);
  }
}

// ─── Built-in evaluators ──────────────────────────────────────────────────────

/**
 * Built-in: emits an `output_length` signal (character count) and a
 * `response_brevity` fact ("short" | "medium" | "long") for routing
 * or adaptive UX decisions.
 */
export const lengthSignal: ProductionEvaluatorDef = {
  name: "length-signal",
  description: "Emits output character count and a brevity classification fact.",
  async run(ctx) {
    const len = ctx.output.length;
    const brevity: string = len < 200 ? "short" : len < 800 ? "medium" : "long";
    return {
      signals: [
        { name: "output_length_chars", value: len, source_evaluator: "length-signal" },
      ],
      facts: [
        {
          key: "session.last_response_brevity",
          value: brevity,
          confidence: 1,
          source_evaluator: "length-signal",
          session_id: ctx.session_id,
          turn_id: ctx.turn_id,
          extracted_at: ctx.completed_at,
        },
      ],
    };
  },
};

/**
 * Built-in: detects if the agent output contains a refusal pattern. Emits a
 * `refusal_detected` signal and, if true, a `session.refusal_observed` fact.
 * Useful for routing follow-up logic or surfacing policy violations.
 */
export const refusalDetector: ProductionEvaluatorDef = {
  name: "refusal-detector",
  description: "Detects standard refusal patterns in agent output.",
  async run(ctx) {
    const lower = ctx.output.toLowerCase();
    const REFUSAL_PATTERNS = [
      "i cannot",
      "i can't",
      "i'm not able to",
      "i am not able to",
      "i won't",
      "i will not",
      "i'm unable to",
      "i am unable to",
      "i must decline",
      "i refuse to",
    ];
    const detected = REFUSAL_PATTERNS.some((p) => lower.includes(p));
    const result: EvaluationOutput = {
      signals: [
        {
          name: "refusal_detected",
          value: detected,
          source_evaluator: "refusal-detector",
        },
      ],
    };
    if (detected) {
      return {
        ...result,
        facts: [
          {
            key: "session.refusal_observed",
            value: true,
            confidence: 0.85,
            source_evaluator: "refusal-detector",
            session_id: ctx.session_id,
            turn_id: ctx.turn_id,
            extracted_at: ctx.completed_at,
          },
        ],
      };
    }
    return result;
  },
};

/**
 * Factory: builds an evaluator that watches the output for any of the given
 * keywords and emits a fact for each matched keyword category.
 *
 * @example
 * ```ts
 * const chainPreference = keywordExtractor("chain-preference", {
 *   "user.prefers_base": ["base", "base network", "base chain"],
 *   "user.prefers_ethereum": ["ethereum", "mainnet", "l1"],
 * });
 * ```
 */
export function keywordExtractor(
  name: string,
  categories: Record<string, readonly string[]>
): ProductionEvaluatorDef {
  return {
    name,
    description: `Extracts keyword-match facts for categories: ${Object.keys(categories).join(", ")}`,
    async run(ctx) {
      const lower = ctx.output.toLowerCase() + " " + ctx.input.toLowerCase();
      const facts: ExtractedFact[] = [];
      for (const [key, keywords] of Object.entries(categories)) {
        const matched = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
        if (matched.length > 0) {
          facts.push({
            key,
            value: matched[0] ?? matched[0]!,
            confidence: Math.min(0.6 + matched.length * 0.1, 0.95),
            source_evaluator: name,
            session_id: ctx.session_id,
            turn_id: ctx.turn_id,
            extracted_at: ctx.completed_at,
          });
        }
      }
      return { facts };
    },
  };
}

/**
 * Built-in: emits a `latency_ms` signal if `ctx.latency_ms` is provided, and
 * a `session.high_latency_observed` fact when latency exceeds the threshold.
 * Default threshold: 5000ms.
 */
export function latencySignal(thresholdMs = 5000): ProductionEvaluatorDef {
  return {
    name: "latency-signal",
    description: `Emits latency signals and a high-latency fact when latency > ${thresholdMs}ms.`,
    async run(ctx) {
      if (ctx.latency_ms === undefined) return {};
      const signals: EvalSignal[] = [
        { name: "latency_ms", value: ctx.latency_ms, source_evaluator: "latency-signal" },
      ];
      if (ctx.latency_ms > thresholdMs) {
        return {
          signals,
          facts: [
            {
              key: "session.high_latency_observed",
              value: ctx.latency_ms,
              confidence: 1,
              source_evaluator: "latency-signal",
              session_id: ctx.session_id,
              turn_id: ctx.turn_id,
              extracted_at: ctx.completed_at,
            },
          ],
        };
      }
      return { signals };
    },
  };
}
