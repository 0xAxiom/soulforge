import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { Database as DatabaseHandle } from "better-sqlite3";
import type { Clock, JsonValue, MemoryRecordProvenance } from "./types.js";
import { createProvenance, systemClock, validateTags } from "./types.js";

export interface LongTermMemoryEntry<TValue extends JsonValue = JsonValue> {
  readonly id: string;
  readonly namespace: string;
  readonly key: string;
  readonly value: TValue;
  readonly tags: string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt: Date | null;
  readonly provenance: MemoryRecordProvenance;
}

export interface PutLongTermMemoryInput<TValue extends JsonValue> {
  readonly namespace?: string;
  readonly key: string;
  readonly value: TValue;
  readonly tags?: readonly string[];
  readonly ttlMs?: number;
  readonly provenance?: Partial<MemoryRecordProvenance>;
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
  readonly schema_version: string;
  readonly provenance_json: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "long-term", "migrations");

export class LongTermMemoryStore {
  private readonly db: DatabaseHandle;
  private readonly clock: Clock;

  constructor(path: string, clock: Clock = systemClock) {
    this.db = openDatabase(path);
    this.clock = clock;
    this.db.pragma("journal_mode = WAL");
    runMigrations(this.db);
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
    const tags = validateTags(input.tags ?? []);
    const provenance = createProvenance(now, input.provenance);

    this.db
      .prepare(
        `INSERT INTO memory_entries
          (id, namespace, key, value_json, tags_json, created_at, updated_at, expires_at, schema_version, provenance_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(namespace, key) DO UPDATE SET
          value_json = excluded.value_json,
          tags_json = excluded.tags_json,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          schema_version = excluded.schema_version,
          provenance_json = excluded.provenance_json`
      )
      .run(
        id,
        namespace,
        input.key,
        JSON.stringify(input.value),
        JSON.stringify(tags),
        createdAt,
        nowIso,
        expiresAt,
        provenance.schema_version,
        JSON.stringify(provenance)
      );

    return {
      id,
      namespace,
      key: input.key,
      value: input.value,
      tags,
      createdAt: new Date(createdAt),
      updatedAt: now,
      expiresAt: expiresAt === null ? null : new Date(expiresAt),
      provenance
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
      expiresAt: row.expires_at === null ? null : new Date(row.expires_at),
      provenance: parseProvenance(row.provenance_json, row.schema_version, new Date(row.updated_at))
    };
  }

  private isExpired(entry: LongTermMemoryEntry): boolean {
    return entry.expiresAt !== null && entry.expiresAt.getTime() <= this.clock.now().getTime();
  }
}

function openDatabase(path: string): DatabaseHandle {
  const parent = dirname(path);
  if (!existsSync(parent)) {
    throw new Error(`Memory database directory does not exist: ${parent}`);
  }
  try {
    return new Database(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown SQLite error";
    throw new Error(`Unable to open memory database at ${path}: ${message}`, { cause: error });
  }
}

function runMigrations(db: DatabaseHandle): void {
  db.exec("CREATE TABLE IF NOT EXISTS memory_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(
    (
      db.prepare("SELECT name FROM memory_migrations").all() as {
        readonly name: string;
      }[]
    ).map((row) => row.name)
  );
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    db.transaction(() => {
      db.exec(readFileSync(join(migrationsDir, file), "utf8"));
      db.prepare("INSERT INTO memory_migrations (name, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
    })();
  }
}

function parseProvenance(raw: string, schemaVersion: string, generatedAt: Date): MemoryRecordProvenance {
  const parsed = JSON.parse(raw) as Partial<MemoryRecordProvenance>;
  return createProvenance(generatedAt, {
    ...parsed,
    schema_version: parsed.schema_version ?? schemaVersion
  });
}
