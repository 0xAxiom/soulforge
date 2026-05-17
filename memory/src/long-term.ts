import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { Database as DatabaseHandle } from "better-sqlite3";
import type { Clock, JsonValue } from "./types.js";
import { systemClock } from "./types.js";

export interface LongTermMemoryEntry<TValue extends JsonValue = JsonValue> {
  readonly id: string;
  readonly namespace: string;
  readonly key: string;
  readonly value: TValue;
  readonly tags: string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt: Date | null;
}

export interface PutLongTermMemoryInput<TValue extends JsonValue> {
  readonly namespace?: string;
  readonly key: string;
  readonly value: TValue;
  readonly tags?: readonly string[];
  readonly ttlMs?: number;
}

export interface ListLongTermMemoryInput {
  readonly namespace?: string;
  readonly tag?: string;
  readonly includeExpired?: boolean;
}

interface MemoryEntryRow {
  readonly id: string;
  readonly namespace: string;
  readonly key: string;
  readonly value_json: string;
  readonly tags_json: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly expires_at: string | null;
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(here, "..", "long-term", "migrations", "001_initial.sql");

export class LongTermMemoryStore {
  private readonly db: DatabaseHandle;
  private readonly clock: Clock;

  constructor(path: string, clock: Clock = systemClock) {
    this.db = new Database(path);
    this.clock = clock;
    this.db.pragma("journal_mode = WAL");
    this.db.exec(readFileSync(migrationPath, "utf8"));
  }

  put<TValue extends JsonValue>(input: PutLongTermMemoryInput<TValue>): LongTermMemoryEntry<TValue> {
    const namespace = input.namespace ?? "default";
    const now = this.clock.now();
    const nowIso = now.toISOString();
    const existing = this.db
      .prepare("SELECT id, created_at FROM memory_entries WHERE namespace = ? AND key = ?")
      .get(namespace, input.key) as { id: string; created_at: string } | undefined;
    const id = existing?.id ?? crypto.randomUUID();
    const createdAt = existing?.created_at ?? nowIso;
    const expiresAt = input.ttlMs === undefined ? null : new Date(now.getTime() + input.ttlMs).toISOString();
    const tags = [...new Set(input.tags ?? [])].sort();

    this.db
      .prepare(
        `INSERT INTO memory_entries
          (id, namespace, key, value_json, tags_json, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(namespace, key) DO UPDATE SET
          value_json = excluded.value_json,
          tags_json = excluded.tags_json,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at`
      )
      .run(id, namespace, input.key, JSON.stringify(input.value), JSON.stringify(tags), createdAt, nowIso, expiresAt);

    return {
      id,
      namespace,
      key: input.key,
      value: input.value,
      tags,
      createdAt: new Date(createdAt),
      updatedAt: now,
      expiresAt: expiresAt === null ? null : new Date(expiresAt)
    };
  }

  get<TValue extends JsonValue = JsonValue>(key: string, namespace = "default"): LongTermMemoryEntry<TValue> | null {
    const row = this.db
      .prepare("SELECT * FROM memory_entries WHERE namespace = ? AND key = ?")
      .get(namespace, key) as MemoryEntryRow | undefined;
    if (!row) return null;
    const entry = this.rowToEntry<TValue>(row);
    if (this.isExpired(entry)) {
      this.delete(key, namespace);
      return null;
    }
    return entry;
  }

  list<TValue extends JsonValue = JsonValue>(input: ListLongTermMemoryInput = {}): LongTermMemoryEntry<TValue>[] {
    const namespace = input.namespace ?? "default";
    const rows = this.db
      .prepare("SELECT * FROM memory_entries WHERE namespace = ? ORDER BY updated_at DESC")
      .all(namespace) as MemoryEntryRow[];
    return rows
      .map((row) => this.rowToEntry<TValue>(row))
      .filter((entry) => (input.includeExpired === true ? true : !this.isExpired(entry)))
      .filter((entry) => (input.tag === undefined ? true : entry.tags.includes(input.tag)));
  }

  delete(key: string, namespace = "default"): boolean {
    const result = this.db
      .prepare("DELETE FROM memory_entries WHERE namespace = ? AND key = ?")
      .run(namespace, key);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }

  private rowToEntry<TValue extends JsonValue>(row: MemoryEntryRow): LongTermMemoryEntry<TValue> {
    return {
      id: row.id,
      namespace: row.namespace,
      key: row.key,
      value: JSON.parse(row.value_json) as TValue,
      tags: JSON.parse(row.tags_json) as string[],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      expiresAt: row.expires_at === null ? null : new Date(row.expires_at)
    };
  }

  private isExpired(entry: LongTermMemoryEntry): boolean {
    return entry.expiresAt !== null && entry.expiresAt.getTime() <= this.clock.now().getTime();
  }
}
