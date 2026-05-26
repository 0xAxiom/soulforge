import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  SqliteRecallStore,
  HashEmbeddingBackend,
  LongTermMemoryStore,
} from "../../../../memory/src/index.js";
import type { RecallDocument } from "../../../../memory/src/index.js";

function defaultDataDir(): string {
  return process.env["SOULFORGE_MEMORY_DIR"] ?? join(homedir(), ".soulforge", "mcp");
}

function openRecallStore(): SqliteRecallStore {
  const dir = defaultDataDir();
  mkdirSync(dir, { recursive: true });
  const backend = new HashEmbeddingBackend(64);
  return new SqliteRecallStore(join(dir, "recall.sqlite"), backend);
}

function openLongTermStore(): LongTermMemoryStore {
  const dir = defaultDataDir();
  mkdirSync(dir, { recursive: true });
  return new LongTermMemoryStore(join(dir, "long-term.sqlite"));
}

// Singleton stores — opened once per process lifetime.
let _recall: SqliteRecallStore | null = null;
let _longTerm: LongTermMemoryStore | null = null;

function recall(): SqliteRecallStore {
  return (_recall ??= openRecallStore());
}

function longTerm(): LongTermMemoryStore {
  return (_longTerm ??= openLongTermStore());
}

// ── memory_recall ─────────────────────────────────────────────────────────────

export interface MemoryRecallInput {
  query: string;
  k?: number;
  filter_tags?: string[];
}

export interface MemoryRecallOutput {
  records: Array<{
    id: string;
    content: string;
    tags: string[];
    created_at: string;
    similarity: number;
  }>;
  total_searched: number;
}

export function memoryRecall(input: MemoryRecallInput): MemoryRecallOutput {
  const k = Math.min(input.k ?? 5, 20);
  const rawResults = recall().query(input.query, { limit: k });
  const results = input.filter_tags?.length
    ? rawResults.filter((r) =>
        input.filter_tags!.some((tag) =>
          (r.metadata as Record<string, unknown>)?.["tags"]
            ? ((r.metadata as Record<string, unknown>)["tags"] as string[]).includes(tag)
            : false
        )
      )
    : rawResults;

  return {
    records: results.map((r) => ({
      id: r.id,
      content: r.text,
      tags: Array.isArray((r.metadata as Record<string, unknown>)?.["tags"])
        ? ((r.metadata as Record<string, unknown>)["tags"] as string[])
        : [],
      created_at: r.provenance.recorded_at,
      similarity: r.score,
    })),
    total_searched: rawResults.length,
  };
}

// ── memory_write ──────────────────────────────────────────────────────────────

export interface MemoryWriteInput {
  content: string;
  tags?: string[];
  ttl_days?: number;
  caller_id: string;
}

export interface MemoryWriteOutput {
  record_id: string;
  created_at: string;
}

export function memoryWrite(
  input: MemoryWriteInput,
  allowedCallers: string[]
): MemoryWriteOutput {
  if (allowedCallers.length > 0 && !allowedCallers.includes(input.caller_id)) {
    throw new Error(
      `caller_id '${input.caller_id}' is not in the soul's allowed_callers list`
    );
  }

  // Persist in both long-term (KV) and recall (semantic) stores.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const tags = input.tags ?? [];
  const ttlMs = input.ttl_days != null ? input.ttl_days * 86_400_000 : undefined;

  longTerm().put({
    key: id,
    value: input.content,
    tags,
    ...(ttlMs !== undefined ? { ttlMs } : {}),
    // Pass model_provider to carry the caller context through provenance
    provenance: { model_provider: "mcp", model_name: input.caller_id },
  });

  const doc: RecallDocument = {
    id,
    text: input.content,
    metadata: { tags, caller_id: input.caller_id, written_at: now },
  };
  recall().add(doc);

  return { record_id: id, created_at: now };
}

// ── memory/recent resource ────────────────────────────────────────────────────

export interface RecentMemoryRecord {
  id: string;
  key: string;
  value: unknown;
  tags: string[];
  created_at: string;
}

export function recentMemory(limit: number): RecentMemoryRecord[] {
  const entries = longTerm().list({ includeExpired: false });
  return entries
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      key: e.key,
      value: e.value,
      tags: e.tags,
      created_at: e.createdAt.toISOString(),
    }));
}
