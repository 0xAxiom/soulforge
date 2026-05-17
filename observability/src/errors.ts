import type { ObservationEvent, ObservabilitySink } from "./types.js";
import { nowIso } from "./types.js";

export interface ErrorInput {
  readonly trace_id: string;
  readonly session_id?: string | undefined;
  readonly turn_id?: string | undefined;
  readonly name: string;
  readonly error_class: string;
  readonly message: string;
  readonly upstream?: string | undefined;
  readonly soul_version?: string | undefined;
  readonly tool?: string | undefined;
}

export interface ErrorGroup {
  readonly key: string;
  readonly count: number;
  readonly error_class: string;
  readonly upstream: string;
  readonly tool: string;
  readonly soul_version: string;
}

export class ErrorRecorder {
  constructor(private readonly sink: ObservabilitySink) {}

  record(input: ErrorInput): ObservationEvent {
    const event: ObservationEvent = {
      trace_id: input.trace_id,
      session_id: input.session_id,
      turn_id: input.turn_id,
      kind: "error",
      name: input.name,
      ok: false,
      at: nowIso(),
      soul_version: input.soul_version,
      tool: input.tool,
      upstream: input.upstream,
      error: {
        error_class: input.error_class,
        message: input.message,
        upstream: input.upstream
      }
    };
    this.sink.emit(event);
    return event;
  }
}

export function groupErrors(events: readonly ObservationEvent[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const event of events) {
    if (event.kind !== "error" || event.error === undefined) continue;
    const errorClass = event.error.error_class;
    const upstream = event.upstream ?? event.error.upstream ?? "local";
    const tool = event.tool ?? "unknown-tool";
    const soulVersion = event.soul_version ?? "unknown-soul";
    const key = `${tool}|${soulVersion}|${upstream}|${errorClass}`;
    const current = groups.get(key);
    groups.set(key, {
      key,
      count: (current?.count ?? 0) + 1,
      error_class: errorClass,
      upstream,
      tool,
      soul_version: soulVersion
    });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
