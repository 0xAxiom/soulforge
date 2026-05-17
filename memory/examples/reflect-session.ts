import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  JsonlMemoryTelemetrySink,
  LongTermMemoryStore,
  ReflectionPipeline,
  ShortTermMemory,
  SqliteRecallStore
} from "../src/index.js";

const dataDir = process.env.SOULFORGE_MEMORY_DIR ?? join(homedir(), ".soulforge", "memory-demo");
mkdirSync(dataDir, { recursive: true });

const shortTerm = new ShortTermMemory<string>();
shortTerm.set("current-agent", "url-inspector-with-memory");

const longTerm = new LongTermMemoryStore(join(dataDir, "long-term.sqlite"));
const recall = new SqliteRecallStore(join(dataDir, "recall.sqlite"));
const telemetry = new JsonlMemoryTelemetrySink(join(dataDir, "memory-events.jsonl"));
const reflection = new ReflectionPipeline({ longTerm, recall, telemetry });

const summary = reflection.run({
  traceId: "demo-reflect-001",
  sessionId: "demo-session-001",
  tags: ["demo", "url-inspector"],
  transcript: [
    {
      role: "user",
      content: "When inspecting pages, remember if a site repeatedly lacks Open Graph metadata."
    },
    {
      role: "assistant",
      content: "We decided to persist inspection summaries and use recall before fetching a URL again."
    },
    {
      role: "user",
      content: "Can the next run recall the x402 pricing note?"
    },
    {
      role: "assistant",
      content: "The x402 URL inspector charges one cent in USDC on Base."
    }
  ]
});

const recalled = recall.query("What did we decide about x402 pricing and repeated URL inspections?", {
  limit: 2
});

console.log(JSON.stringify({
  shortTerm: shortTerm.get("current-agent"),
  summary,
  recalled,
  files: {
    directory: dataDir,
    longTerm: join(dataDir, "long-term.sqlite"),
    recall: join(dataDir, "recall.sqlite"),
    telemetry: join(dataDir, "memory-events.jsonl")
  }
}, null, 2));

longTerm.close();
recall.close();
