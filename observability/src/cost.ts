import type { ObservationEvent, ObservabilitySink } from "./types.js";
import { nowIso } from "./types.js";

export interface CostInput {
  readonly trace_id: string;
  readonly session_id?: string | undefined;
  readonly turn_id?: string | undefined;
  readonly name: string;
  readonly cost_usd?: number | undefined;
  readonly usdc_amount?: string | undefined;
  readonly soul_version?: string | undefined;
  readonly tool?: string | undefined;
}

export interface CostSummary {
  readonly events: number;
  readonly total_cost_usd: number;
  readonly total_usdc_amount: number;
}

export class CostLedger {
  constructor(private readonly sink: ObservabilitySink) {}

  record(input: CostInput): ObservationEvent {
    const event: ObservationEvent = {
      trace_id: input.trace_id,
      session_id: input.session_id,
      turn_id: input.turn_id,
      kind: "cost",
      name: input.name,
      ok: true,
      at: nowIso(),
      cost_usd: input.cost_usd,
      usdc_amount: input.usdc_amount,
      soul_version: input.soul_version,
      tool: input.tool
    };
    this.sink.emit(event);
    return event;
  }

  static summarize(events: readonly ObservationEvent[]): CostSummary {
    const costEvents = events.filter((event) => event.kind === "cost");
    return {
      events: costEvents.length,
      total_cost_usd: round(costEvents.reduce((sum, event) => sum + (event.cost_usd ?? 0), 0)),
      total_usdc_amount: round(costEvents.reduce((sum, event) => sum + Number(event.usdc_amount ?? 0), 0))
    };
  }
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
