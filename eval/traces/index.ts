import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ReplayMetadata } from "../src/types.js";

export interface TraceRecord {
  readonly trace_id: string;
  readonly session_id: string;
  readonly turn_id: string;
  readonly soul_version: string;
  readonly golden_id: string;
  readonly input: string;
  readonly tools_called: readonly string[];
  readonly output: string;
  readonly cost_usd: number;
  readonly duration_ms: number;
  readonly metric_passed: boolean;
  readonly replay: ReplayMetadata;
  readonly created_at: string;
}

export class JsonlTraceRecorder {
  constructor(private readonly path: string) {}

  append(record: TraceRecord): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(record)}\n`, "utf8");
  }
}
