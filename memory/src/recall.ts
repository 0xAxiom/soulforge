import { existsSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Database as DatabaseHandle } from "better-sqlite3";
import type { Clock, JsonObject, MemoryRecordProvenance } from "./types.js";
import { createProvenance, systemClock } from "./types.js";

export interface RecallDocument {
  readonly id: string;
  readonly namespace?: string;
  readonly text: string;
  readonly metadata?: JsonObject;
  readonly provenance?: Partial<MemoryRecordProvenance>;
}

export interface RecallResult {
  readonly id: string;
  readonly namespace: string;
  readonly text: string;
  readonly metadata: JsonObject;
  readonly score: number;
  readonly provenance: MemoryRecordProvenance;
}

export interface EmbeddingBackend {
  readonly name: string;
  readonly dimensions: number;
  embed(text: string): number[];
}

interface RecallRow {
  readonly id: string;
  readonly namespace: string;
  readonly text: string;
  readonly metadata_json: string;
  readonly vector_json: string;
  readonly schema_version: string;
  readonly embedding_version: string;
  readonly provenance_json: string;
}

export class HashEmbeddingBackend implements EmbeddingBackend {
  readonly name = "local-hash-v1";
  readonly dimensions: number;

  constructor(dimensions = 64) {
    if (dimensions < 8) throw new Error("HashEmbeddingBackend requires at least 8 dimensions");
    this.dimensions = dimensions;
  }

  embed(text: string): number[] {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    for (const token of tokenize(text)) {
      const index = hashToken(token) % this.dimensions;
      vector[index] = (vector[index] ?? 0) + 1;
    }
    return normalize(vector);
  }
}

export class SqliteRecallStore {
  private readonly db: DatabaseHandle;
  private readonly embeddings: EmbeddingBackend;
  private readonly clock: Clock;

  constructor(path: string, embeddings: EmbeddingBackend = new HashEmbeddingBackend(), clock: Clock = systemClock) {
    this.db = openDatabase(path);
    this.embeddings = embeddings;
    this.clock = clock;
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recall_items (
        id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        text TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        embedding_backend TEXT NOT NULL,
        schema_version TEXT NOT NULL DEFAULT 'memory-record.v1',
        embedding_version TEXT NOT NULL DEFAULT 'local-hash-v1',
        provenance_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        PRIMARY KEY (namespace, id)
      );
      CREATE INDEX IF NOT EXISTS recall_items_namespace ON recall_items(namespace);
    `);
    ensureRecallColumn(this.db, "schema_version", "TEXT NOT NULL DEFAULT 'memory-record.v1'");
    ensureRecallColumn(this.db, "embedding_version", "TEXT NOT NULL DEFAULT 'local-hash-v1'");
    ensureRecallColumn(this.db, "provenance_json", "TEXT NOT NULL DEFAULT '{}'");
  }

  add(document: RecallDocument): RecallResult {
    const namespace = document.namespace ?? "default";
    const now = this.clock.now();
    const vector = this.embeddings.embed(document.text);
    const metadata = document.metadata ?? {};
    const provenance = createProvenance(now, {
      ...document.provenance,
      embedding_version: document.provenance?.embedding_version ?? this.embeddings.name
    });
    this.db
      .prepare(
        `INSERT INTO recall_items
          (id, namespace, text, metadata_json, vector_json, embedding_backend, schema_version, embedding_version, provenance_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(namespace, id) DO UPDATE SET
          text = excluded.text,
          metadata_json = excluded.metadata_json,
          vector_json = excluded.vector_json,
          embedding_backend = excluded.embedding_backend,
          schema_version = excluded.schema_version,
          embedding_version = excluded.embedding_version,
          provenance_json = excluded.provenance_json`
      )
      .run(
        document.id,
        namespace,
        document.text,
        JSON.stringify(metadata),
        JSON.stringify(vector),
        this.embeddings.name,
        provenance.schema_version,
        provenance.embedding_version,
        JSON.stringify(provenance),
        now.toISOString()
      );
    return { id: document.id, namespace, text: document.text, metadata, score: 1, provenance };
  }

  query(text: string, options: { readonly namespace?: string; readonly limit?: number } = {}): RecallResult[] {
    const namespace = options.namespace ?? "default";
    const limit = options.limit ?? 5;
    const queryVector = this.embeddings.embed(text);
    const rows = this.db
      .prepare(
        "SELECT id, namespace, text, metadata_json, vector_json, schema_version, embedding_version, provenance_json FROM recall_items WHERE namespace = ?"
      )
      .all(namespace) as RecallRow[];
    return rows
      .map((row) => ({
        id: row.id,
        namespace: row.namespace,
        text: row.text,
        metadata: JSON.parse(row.metadata_json) as JsonObject,
        score: cosineSimilarity(queryVector, JSON.parse(row.vector_json) as number[]),
        provenance: parseProvenance(row.provenance_json, row.schema_version, row.embedding_version)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  close(): void {
    this.db.close();
  }
}

function openDatabase(path: string): DatabaseHandle {
  const parent = dirname(path);
  if (!existsSync(parent)) {
    throw new Error(`Recall database directory does not exist: ${parent}`);
  }
  try {
    return new Database(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown SQLite error";
    throw new Error(`Unable to open recall database at ${path}: ${message}`, { cause: error });
  }
}

function ensureRecallColumn(db: DatabaseHandle, column: string, definition: string): void {
  const columns = db.prepare("PRAGMA table_info(recall_items)").all() as {
    readonly name: string;
  }[];
  if (!columns.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE recall_items ADD COLUMN ${column} ${definition}`);
  }
}

function parseProvenance(raw: string, schemaVersion: string, embeddingVersion: string): MemoryRecordProvenance {
  const parsed = JSON.parse(raw) as Partial<MemoryRecordProvenance>;
  return createProvenance(new Date(), {
    ...parsed,
    schema_version: parsed.schema_version ?? schemaVersion,
    embedding_version: parsed.embedding_version ?? embeddingVersion
  });
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => !STOP_WORDS.has(token));
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "does",
  "for",
  "how",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "what"
]);

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    const code = token.codePointAt(index);
    if (code === undefined) continue;
    hash ^= code;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += (a[index] ?? 0) * (b[index] ?? 0);
  }
  return score;
}
