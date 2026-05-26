#!/usr/bin/env node
/**
 * SoulForge MCP Server
 *
 * Exposes SoulForge primitives (soul / memory / eval) to external agents via MCP.
 * Bind: stdio (default) or HTTP via --port <N>.
 *
 * Usage:
 *   npx tsx endpoints/examples/soulforge-mcp-server/server.ts
 *   npx tsx endpoints/examples/soulforge-mcp-server/server.ts --port 4242
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { soulState, soulIntro, rawSoul } from "./handlers/soul.js";
import { memoryRecall, memoryWrite, recentMemory } from "./handlers/memory.js";
import { evalRun } from "./handlers/eval.js";

// ── Server ────────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "soulforge",
  version: "0.1.0",
});

// ── Tools ─────────────────────────────────────────────────────────────────────

server.tool(
  "soul_state",
  "Returns the current soul's parsed frontmatter and full markdown body. Read-only.",
  { soul_path: z.string().optional().describe("Soul filename under souls/examples/ or an absolute path. Default: starter-soul.md") },
  async ({ soul_path }) => {
    try {
      const result = soulState({ soul_path });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "memory_recall",
  "Semantic recall from the agent's long-term memory store. Returns top-k records by cosine similarity.",
  {
    query: z.string().describe("Natural-language query to match against stored memories"),
    k: z.number().int().min(1).max(20).optional().describe("Number of results to return (default 5, max 20)"),
    filter_tags: z.array(z.string()).optional().describe("Optional tag filter — only return records that have at least one of these tags"),
  },
  async ({ query, k, filter_tags }) => {
    try {
      const result = memoryRecall({ query, k, filter_tags });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "memory_write",
  "Writes a record to long-term memory. Requires caller_id to be in the soul's allowed_callers list (if set).",
  {
    content: z.string().describe("The text content to persist"),
    tags: z.array(z.string()).optional().describe("Optional tags for filtering and organisation"),
    ttl_days: z.number().int().positive().optional().describe("Days until this record expires. Omit for permanent storage."),
    caller_id: z.string().describe("Caller identity — checked against soul's allowed_callers field"),
  },
  async ({ content, tags, ttl_days, caller_id }) => {
    try {
      // Read allowed callers from environment; deployers can also patch this.
      const allowed = process.env["SOULFORGE_ALLOWED_CALLERS"]
        ? (process.env["SOULFORGE_ALLOWED_CALLERS"] as string).split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const result = memoryWrite({ content, tags, ttl_days, caller_id }, allowed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "eval_run",
  "Runs a named golden set against the current soul and returns scores. Uses the content-addressed cache.",
  {
    soul_path: z.string().optional().describe("Soul filename under souls/examples/ or an absolute path. Default: starter-soul.md"),
    golden_set: z.string().optional().describe("Golden set name (folder under eval/goldens/). Default: matches soul name"),
    max_goldens: z.number().int().positive().optional().describe("Limit the number of goldens to run"),
  },
  async ({ soul_path, golden_set: _golden_set, max_goldens }) => {
    try {
      const result = evalRun({ soul_path, max_goldens });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ── Resources ─────────────────────────────────────────────────────────────────

server.resource(
  "soul",
  "soulforge://souls/{name}",
  async (uri) => {
    const name = uri.pathname.replace(/^\/souls\//, "");
    try {
      const markdown = rawSoul(name);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: markdown }] };
    } catch (err) {
      throw new Error(`Soul '${name}' not found: ${(err as Error).message}`);
    }
  }
);

server.resource(
  "memory-recent",
  "soulforge://memory/recent",
  async (uri) => {
    const limitParam = new URL(uri.href).searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 10;
    const records = recentMemory(isNaN(limit) ? 10 : limit);
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(records, null, 2) }] };
  }
);

// ── Prompts ───────────────────────────────────────────────────────────────────

server.prompt(
  "soulforge_intro",
  "Returns a condensed agent introduction (name, capabilities, refusals) as plain text (≤200 words).",
  { soul_path: z.string().optional().describe("Soul to introduce. Default: starter-soul.md") },
  ({ soul_path }) => {
    try {
      const intro = soulIntro({ soul_path });
      return { messages: [{ role: "user", content: { type: "text", text: intro } }] };
    } catch (err) {
      throw new Error(`Failed to load soul: ${(err as Error).message}`);
    }
  }
);

// ── Transport ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
