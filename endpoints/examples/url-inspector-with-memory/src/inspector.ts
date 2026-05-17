import { join } from "node:path";
import { homedir } from "node:os";
import {
  JsonlMemoryTelemetrySink,
  LongTermMemoryStore,
  ReflectionPipeline,
  ShortTermMemory,
  SqliteRecallStore
} from "../../../../memory/src/index.js";
import type { ReflectionSummary, TranscriptTurn } from "../../../../memory/src/index.js";

export interface UrlInspectionInput {
  readonly url: string;
  readonly html: string;
  readonly traceId?: string;
}

export interface UrlInspectionResult {
  readonly url: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly linkCount: number;
  readonly wordCount: number;
  readonly historicalRecall: readonly {
    readonly id: string;
    readonly text: string;
    readonly score: number;
  }[];
}

export interface UrlInspectorWithMemoryOptions {
  readonly dataDir?: string;
  readonly namespace?: string;
}

export class UrlInspectorWithMemory {
  private readonly namespace: string;
  private readonly shortTerm = new ShortTermMemory<string>();
  private readonly longTerm: LongTermMemoryStore;
  private readonly recall: SqliteRecallStore;
  private readonly reflection: ReflectionPipeline;

  constructor(options: UrlInspectorWithMemoryOptions = {}) {
    const dataDir = options.dataDir ?? join(homedir(), ".soulforge", "url-inspector-with-memory");
    this.namespace = options.namespace ?? "url-inspector";
    this.longTerm = new LongTermMemoryStore(join(dataDir, "long-term.sqlite"));
    this.recall = new SqliteRecallStore(join(dataDir, "recall.sqlite"));
    this.reflection = new ReflectionPipeline({
      longTerm: this.longTerm,
      recall: this.recall,
      telemetry: new JsonlMemoryTelemetrySink(join(dataDir, "memory-events.jsonl"))
    });
  }

  inspect(input: UrlInspectionInput): UrlInspectionResult {
    const url = new URL(input.url);
    this.shortTerm.set("current-url", url.toString());
    const historicalRecall = this.recall
      .query(`Prior inspection metadata quality for ${url.hostname}`, {
        namespace: this.namespace,
        limit: 3
      })
      .map((result) => ({ id: result.id, text: result.text, score: result.score }));
    const metadata = extractMeta(input.html);
    const result = {
      url: url.toString(),
      ...metadata,
      historicalRecall
    };
    const key = `inspection:${url.hostname}:${crypto.randomUUID()}`;
    const memoryText = [
      `URL ${result.url}`,
      result.title === null ? "No title found." : `Title: ${result.title}`,
      result.description === null ? "No description found." : `Description: ${result.description}`,
      `Links: ${String(result.linkCount)}`,
      `Words: ${String(result.wordCount)}`
    ].join("\n");

    this.longTerm.put({
      namespace: this.namespace,
      key,
      value: {
        url: result.url,
        title: result.title,
        description: result.description,
        linkCount: result.linkCount,
        wordCount: result.wordCount
      },
      tags: ["url-inspection", url.hostname]
    });
    this.recall.add({
      namespace: this.namespace,
      id: key,
      text: memoryText,
      metadata: { kind: "url-inspection", url: result.url, hostname: url.hostname }
    });
    return result;
  }

  recallSimilar(query: string): UrlInspectionResult["historicalRecall"] {
    return this.recall
      .query(query, { namespace: this.namespace, limit: 3 })
      .map((result) => ({ id: result.id, text: result.text, score: result.score }));
  }

  reflect(sessionId: string, transcript: readonly TranscriptTurn[], traceId?: string): ReflectionSummary {
    const input = {
      sessionId,
      namespace: this.namespace,
      transcript,
      tags: ["url-inspector"]
    };
    return this.reflection.run(traceId === undefined ? input : { ...input, traceId });
  }

  close(): void {
    this.longTerm.close();
    this.recall.close();
  }
}

function pick(html: string, re: RegExp): string | null {
  const match = html.match(re);
  return match?.[1]?.trim() ?? null;
}

function extractMeta(html: string): Omit<UrlInspectionResult, "url" | "historicalRecall"> {
  const title =
    pick(html, /<title[^>]*>([^<]+)<\/title>/i) ??
    pick(html, /<meta\s+(?:name|property)=["']og:title["']\s+content=["']([^"']+)["']/i);
  const description =
    pick(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ??
    pick(html, /<meta\s+(?:name|property)=["']og:description["']\s+content=["']([^"']+)["']/i);
  const linkCount = html.match(/<a\s+[^>]*href=["'][^"']+["']/gi)?.length ?? 0;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = text.length === 0 ? 0 : text.split(" ").length;

  return { title, description, linkCount, wordCount };
}
