import { mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import type { JsonObject } from "./types.js";

export interface MemoryTelemetryEvent {
  readonly traceId: string;
  readonly operation: string;
  readonly latencyMs: number;
  readonly costUsd: number;
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
