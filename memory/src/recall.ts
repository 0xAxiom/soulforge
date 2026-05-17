import Database from "better-sqlite3";
import type { Database as DatabaseHandle } from "better-sqlite3";
import type { Clock, JsonObject } from "./types.js";
import { systemClock } from "./types.js";

export interface RecallDocument {
  readonly id: string;
  readonly namespace?: string;
  readonly text: string;
  readonly metadata?: JsonObject;
}

export interface RecallResult {
  readonly id: string;
  readonly namespace: string;
  readonly text: string;
  readonly metadata: JsonObject;
  readonly score: number;
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
    this.db = new Database(path);
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
        created_at TEXT NOT NULL,
        PRIMARY KEY (namespace, id)
      );
      CREATE INDEX IF NOT EXISTS recall_items_namespace ON recall_items(namespace);
    `);
  }

  add(document: RecallDocument): RecallResult {
    const namespace = document.namespace ?? "default";
    const vector = this.embeddings.embed(document.text);
    const metadata = document.metadata ?? {};
    this.db
      .prepare(
        `INSERT INTO recall_items
          (id, namespace, text, metadata_json, vector_json, embedding_backend, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(namespace, id) DO UPDATE SET
          text = excluded.text,
          metadata_json = excluded.metadata_json,
          vector_json = excluded.vector_json,
          embedding_backend = excluded.embedding_backend`
      )
      .run(
        document.id,
        namespace,
        document.text,
        JSON.stringify(metadata),
        JSON.stringify(vector),
        this.embeddings.name,
        this.clock.now().toISOString()
      );
    return { id: document.id, namespace, text: document.text, metadata, score: 1 };
  }

  query(text: string, options: { readonly namespace?: string; readonly limit?: number } = {}): RecallResult[] {
    const namespace = options.namespace ?? "default";
    const limit = options.limit ?? 5;
    const queryVector = this.embeddings.embed(text);
    const rows = this.db
      .prepare("SELECT id, namespace, text, metadata_json, vector_json FROM recall_items WHERE namespace = ?")
      .all(namespace) as RecallRow[];
    return rows
      .map((row) => ({
        id: row.id,
        namespace: row.namespace,
        text: row.text,
        metadata: JSON.parse(row.metadata_json) as JsonObject,
        score: cosineSimilarity(queryVector, JSON.parse(row.vector_json) as number[])
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  close(): void {
    this.db.close();
  }
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
