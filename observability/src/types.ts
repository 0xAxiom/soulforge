export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export type ObservationKind = "cost" | "latency" | "error" | "tool_call" | "receipt";

export interface ObservationError {
  readonly error_class: string;
  readonly message: string;
  readonly upstream?: string | undefined;
}

export interface ObservationEvent {
  readonly trace_id: string;
  readonly session_id?: string | undefined;
  readonly turn_id?: string | undefined;
  readonly parent_turn_id?: string | undefined;
  readonly kind: ObservationKind;
  readonly name: string;
  readonly ok: boolean;
  readonly at: string;
  readonly duration_ms?: number | undefined;
  readonly cost_usd?: number | undefined;
  readonly usdc_amount?: string | undefined;
  readonly soul_version?: string | undefined;
  readonly tool?: string | undefined;
  readonly upstream?: string | undefined;
  readonly error?: ObservationError | undefined;
  readonly attributes?: JsonObject | undefined;
}

export interface ObservabilitySink {
  emit(event: ObservationEvent): void;
}

export function nowIso(): string {
  return new Date().toISOString();
}
