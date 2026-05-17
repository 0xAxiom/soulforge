import { createHash } from "node:crypto";
import type { LongTermMemoryStore } from "./long-term.js";
import type { SqliteRecallStore } from "./recall.js";
import type { JsonObject, MemoryRecordProvenance } from "./types.js";
import { validateTags } from "./types.js";
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
  readonly turnId?: string;
  readonly parentTurnId?: string;
  readonly soulVersion?: string;
  readonly modelProvider?: string;
  readonly modelName?: string;
  readonly reflectionStrategyVersion?: string;
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
    validateReflectionInput(input);
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
    const sessionId = input.sessionId;
    try {
      validateReflectionInput(input);
      const namespace = input.namespace ?? "default";
      const tags = validateTags(["reflection", ...(input.tags ?? [])]);
      const sourceTranscriptHash = hashTranscript(input.transcript);
      const generatedAt = new Date();
      const provenance = reflectionProvenance(input, sourceTranscriptHash, generatedAt);
      const summary = this.summarizer.summarize(input);
      const value = summaryToJson(summary);
      this.longTerm.put({
        namespace,
        key: `reflection:${input.sessionId}`,
        value,
        tags,
        provenance
      });
      this.recall.add({
        namespace,
        id: `reflection:${input.sessionId}`,
        text: [summary.summary, ...summary.facts, ...summary.decisions, ...summary.openQuestions].join("\n"),
        metadata: { kind: "reflection", sessionId: input.sessionId, sourceTranscriptHash },
        provenance
      });
      this.telemetry.emit({
        trace_id: traceId,
        session_id: sessionId,
        turn_id: input.turnId,
        parent_turn_id: input.parentTurnId,
        operation: "memory.reflect",
        latency_ms: Math.round(performance.now() - startedAt),
        cost_usd: 0,
        ok: true,
        attributes: { namespace, sessionId: input.sessionId }
      });
      return summary;
    } catch (error) {
      this.telemetry.emit({
        trace_id: traceId,
        session_id: sessionId,
        turn_id: input.turnId,
        parent_turn_id: input.parentTurnId,
        operation: "memory.reflect",
        latency_ms: Math.round(performance.now() - startedAt),
        cost_usd: 0,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown reflection error"
      });
      throw error;
    }
  }
}

export function hashTranscript(transcript: readonly TranscriptTurn[]): string {
  return createHash("sha256").update(JSON.stringify(transcript)).digest("hex");
}

function validateReflectionInput(input: ReflectionInput): void {
  if (input.sessionId.trim().length === 0) {
    throw new Error("Reflection input requires a non-empty sessionId");
  }
  if (input.transcript.length === 0) {
    throw new Error("Reflection input requires at least one transcript turn");
  }
  for (const turn of input.transcript) {
    if (turn.content.trim().length === 0) {
      throw new Error("Reflection transcript turns must have non-empty content");
    }
  }
}

function reflectionProvenance(
  input: ReflectionInput,
  sourceTranscriptHash: string,
  generatedAt: Date
): Partial<MemoryRecordProvenance> {
  const reflectionVersion = "reflection.v1";
  const strategyVersion = input.reflectionStrategyVersion ?? "extractive-summary.v1";
  return {
    schema_version: "memory-record.v1",
    embedding_version: "local-hash-v1",
    reflection_version: reflectionVersion,
    source_transcript_hash: sourceTranscriptHash,
    soul_version: input.soulVersion ?? null,
    model_provider: input.modelProvider ?? "local",
    model_name: input.modelName ?? "extractive-summary",
    generated_at: generatedAt.toISOString(),
    reflection_strategy_version: strategyVersion
  };
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
