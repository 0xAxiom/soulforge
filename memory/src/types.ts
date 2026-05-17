export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export interface Clock {
  now(): Date;
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
