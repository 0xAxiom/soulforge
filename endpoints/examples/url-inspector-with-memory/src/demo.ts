import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { UrlInspectorWithMemory } from "./inspector.js";

const dataDir = process.env.SOULFORGE_URL_MEMORY_DIR ?? join(homedir(), ".soulforge", "url-inspector-with-memory");
mkdirSync(dataDir, { recursive: true });

const agent = new UrlInspectorWithMemory({ dataDir });

const first = agent.inspect({
  traceId: "url-demo-001",
  url: "https://example.com",
  html: `<!doctype html>
    <html>
      <head>
        <title>Example Domain</title>
        <meta name="description" content="A stable example page for documentation.">
      </head>
      <body><p>This domain is for use in illustrative examples.</p><a href="https://iana.org">More</a></body>
    </html>`
});

const second = agent.inspect({
  traceId: "url-demo-002",
  url: "https://example.com/about",
  html: `<!doctype html>
    <html>
      <head><title>Example About</title></head>
      <body><p>Another example page with sparse metadata.</p></body>
    </html>`
});

const semanticRecall = agent.recallSimilar("metadata quality for example.com pages");
const reflection = agent.reflect(
  "url-demo-session",
  [
    { role: "user", content: "Inspect https://example.com and remember the metadata quality." },
    { role: "assistant", content: "The page has a title, description, one link, and a small body." },
    { role: "user", content: "If I ask about metadata quality later, recall the historical result." },
    { role: "assistant", content: "We decided to persist inspection summaries and add them to recall." }
  ],
  "url-demo-reflect"
);

console.log(JSON.stringify({ first, second, semanticRecall, reflection, dataDir }, null, 2));

agent.close();
