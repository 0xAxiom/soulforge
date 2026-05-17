import type { LongTermMemoryStore } from "./long-term.js";
import type { SqliteRecallStore } from "./recall.js";
import type { JsonObject } from "./types.js";
import type { MemoryTelemetrySink } from "./telemetry.js";
import { NoopMemoryTelemetrySink } from "./telemetry.js";

export type TranscriptRole = "user" | "assistant" | "tool" | "system";

export interface TranscriptTurn {
  readonly role: TranscriptRole;
  readonly content: string;
  readonly at?: string;
}

export interface ReflectionInput {
  readonly sessionId: string;
  readonly namespace?: string;
  readonly transcript: readonly TranscriptTurn[];
  readonly tags?: readonly string[];
  readonly traceId?: string;
}

export interface ReflectionSummary {
  readonly sessionId: string;
  readonly summary: string;
  readonly facts: string[];
  readonly decisions: string[];
  readonly openQuestions: string[];
}

export interface SummaryGenerator {
  summarize(input: ReflectionInput): ReflectionSummary;
}

export interface ReflectionPipelineOptions {
  readonly longTerm: LongTermMemoryStore;
  readonly recall: SqliteRecallStore;
  readonly summarizer?: SummaryGenerator;
  readonly telemetry?: MemoryTelemetrySink;
}

export class ExtractiveSummaryGenerator implements SummaryGenerator {
  summarize(input: ReflectionInput): ReflectionSummary {
    const userTurns = input.transcript.filter((turn) => turn.role === "user").map((turn) => turn.content);
    const assistantTurns = input.transcript.filter((turn) => turn.role === "assistant").map((turn) => turn.content);
    const decisions = input.transcript
      .map((turn) => turn.content)
      .filter((content) => /\b(decided|decision|use|prefer|ship|choose|chosen)\b/i.test(content))
      .slice(0, 5);
    const facts = userTurns.slice(0, 5);
    const openQuestions = input.transcript
      .map((turn) => turn.content)
      .filter((content) => content.trim().endsWith("?"))
      .slice(0, 5);
    const summary = [
      `Session ${input.sessionId} contained ${String(input.transcript.length)} turns.`,
      userTurns.length > 0 ? `User focus: ${userTurns[userTurns.length - 1] ?? ""}` : "No user turns recorded.",
      assistantTurns.length > 0
        ? `Assistant outcome: ${assistantTurns[assistantTurns.length - 1] ?? ""}`
        : "No assistant turns recorded."
    ].join(" ");
    return { sessionId: input.sessionId, summary, facts, decisions, openQuestions };
  }
}

export class ReflectionPipeline {
  private readonly longTerm: LongTermMemoryStore;
  private readonly recall: SqliteRecallStore;
  private readonly summarizer: SummaryGenerator;
  private readonly telemetry: MemoryTelemetrySink;

  constructor(options: ReflectionPipelineOptions) {
    this.longTerm = options.longTerm;
    this.recall = options.recall;
    this.summarizer = options.summarizer ?? new ExtractiveSummaryGenerator();
    this.telemetry = options.telemetry ?? new NoopMemoryTelemetrySink();
  }

  run(input: ReflectionInput): ReflectionSummary {
    const startedAt = performance.now();
    const traceId = input.traceId ?? crypto.randomUUID();
    try {
      const namespace = input.namespace ?? "default";
      const tags = ["reflection", ...(input.tags ?? [])];
      const summary = this.summarizer.summarize(input);
      const value = summaryToJson(summary);
      this.longTerm.put({
        namespace,
        key: `reflection:${input.sessionId}`,
        value,
        tags
      });
      this.recall.add({
        namespace,
        id: `reflection:${input.sessionId}`,
        text: [summary.summary, ...summary.facts, ...summary.decisions, ...summary.openQuestions].join("\n"),
        metadata: { kind: "reflection", sessionId: input.sessionId }
      });
      this.telemetry.emit({
        traceId,
        operation: "memory.reflect",
        latencyMs: Math.round(performance.now() - startedAt),
        costUsd: 0,
        ok: true,
        attributes: { namespace, sessionId: input.sessionId }
      });
      return summary;
    } catch (error) {
      this.telemetry.emit({
        traceId,
        operation: "memory.reflect",
        latencyMs: Math.round(performance.now() - startedAt),
        costUsd: 0,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown reflection error"
      });
      throw error;
    }
  }
}

function summaryToJson(summary: ReflectionSummary): JsonObject {
  return {
    sessionId: summary.sessionId,
    summary: summary.summary,
    facts: summary.facts,
    decisions: summary.decisions,
    openQuestions: summary.openQuestions
  };
}
