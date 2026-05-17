import type { JsonValue } from "./types.js";

export interface ShortTermMemoryEntry<TValue extends JsonValue> {
  readonly key: string;
  readonly value: TValue;
  readonly updatedAt: Date;
}

export class ShortTermMemory<TValue extends JsonValue = JsonValue> {
  private readonly values = new Map<string, ShortTermMemoryEntry<TValue>>();

  set(key: string, value: TValue, updatedAt = new Date()): ShortTermMemoryEntry<TValue> {
    const entry = { key, value, updatedAt };
    this.values.set(key, entry);
    return entry;
  }

  get(key: string): TValue | undefined {
    return this.values.get(key)?.value;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  delete(key: string): boolean {
    return this.values.delete(key);
  }

  entries(): ShortTermMemoryEntry<TValue>[] {
    return [...this.values.values()];
  }

  clear(): void {
    this.values.clear();
  }
}
