import { mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import type { JsonObject } from "./types.js";

export interface MemoryTelemetryEvent {
  readonly trace_id: string;
  readonly session_id?: string | undefined;
  readonly turn_id?: string | undefined;
  readonly parent_turn_id?: string | undefined;
  readonly operation: string;
  readonly latency_ms: number;
  readonly cost_usd: number;
  readonly ok: boolean;
  readonly error?: string;
  readonly attributes?: JsonObject;
}

export interface MemoryTelemetrySink {
  emit(event: MemoryTelemetryEvent): void;
}

export class JsonlMemoryTelemetrySink implements MemoryTelemetrySink {
  constructor(private readonly path: string) {}

  emit(event: MemoryTelemetryEvent): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(event)}\n`, "utf8");
  }
}

export class NoopMemoryTelemetrySink implements MemoryTelemetrySink {
  emit(): void {
    return undefined;
  }
}
