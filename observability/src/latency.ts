import type { ObservationEvent, ObservabilitySink } from "./types.js";
import { nowIso } from "./types.js";

export interface LatencyInput {
  readonly trace_id: string;
  readonly session_id?: string | undefined;
  readonly turn_id?: string | undefined;
  readonly name: string;
  readonly duration_ms: number;
  readonly soul_version?: string | undefined;
  readonly tool?: string | undefined;
  readonly ok?: boolean | undefined;
}

export class LatencyRecorder {
  constructor(private readonly sink: ObservabilitySink) {}

  record(input: LatencyInput): ObservationEvent {
    const event: ObservationEvent = {
      trace_id: input.trace_id,
      session_id: input.session_id,
      turn_id: input.turn_id,
      kind: "latency",
      name: input.name,
      ok: input.ok ?? true,
      at: nowIso(),
      duration_ms: input.duration_ms,
      soul_version: input.soul_version,
      tool: input.tool
    };
    this.sink.emit(event);
    return event;
  }
}

export class LatencyHistogram {
  private readonly values: number[] = [];

  record(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error("Latency duration must be a finite non-negative number");
    }
    this.values.push(durationMs);
  }

  percentile(p: number): number {
    if (p < 0 || p > 100) {
      throw new Error("Percentile must be between 0 and 100");
    }
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? 0;
  }

  static fromEvents(events: readonly ObservationEvent[], name?: string): LatencyHistogram {
    const histogram = new LatencyHistogram();
    for (const event of events) {
      if (event.kind === "latency" && event.duration_ms !== undefined && (name === undefined || event.name === name)) {
        histogram.record(event.duration_ms);
      }
    }
    return histogram;
  }
}
