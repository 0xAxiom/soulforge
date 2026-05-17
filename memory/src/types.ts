export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export interface Clock {
  now(): Date;
}

export interface MemoryRecordProvenance {
  readonly schema_version: string;
  readonly embedding_version: string | null;
  readonly reflection_version: string | null;
  readonly source_transcript_hash: string | null;
  readonly soul_version: string | null;
  readonly model_provider: string | null;
  readonly model_name: string | null;
  readonly generated_at: string;
  readonly reflection_strategy_version: string | null;
}

export const systemClock: Clock = {
  now: () => new Date()
};

export function assertJsonObject(value: JsonValue): JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Expected JSON object");
  }
  return value;
}

export function createProvenance(
  generatedAt: Date,
  overrides: Partial<MemoryRecordProvenance> = {}
): MemoryRecordProvenance {
  return {
    schema_version: overrides.schema_version ?? "memory-record.v1",
    embedding_version: overrides.embedding_version ?? null,
    reflection_version: overrides.reflection_version ?? null,
    source_transcript_hash: overrides.source_transcript_hash ?? null,
    soul_version: overrides.soul_version ?? null,
    model_provider: overrides.model_provider ?? null,
    model_name: overrides.model_name ?? null,
    generated_at: overrides.generated_at ?? generatedAt.toISOString(),
    reflection_strategy_version: overrides.reflection_strategy_version ?? null
  };
}

export function validateTags(tags: readonly string[]): string[] {
  const unique = [...new Set(tags)].sort();
  for (const tag of unique) {
    if (!/^[a-z0-9][a-z0-9.-]{0,127}$/.test(tag)) {
      throw new Error(`Invalid memory tag "${tag}". Tags must be lowercase letters, numbers, dots, or dashes.`);
    }
  }
  return unique;
}
