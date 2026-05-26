import { describe, it, expect, beforeAll } from "vitest";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { soulState, soulIntro, listSouls } from "../handlers/soul.js";
import { memoryRecall, memoryWrite, recentMemory } from "../handlers/memory.js";

// ── soul handlers ─────────────────────────────────────────────────────────────

describe("soul handlers", () => {
  it("soulState returns structured data for the starter soul", () => {
    const result = soulState({ soul_path: "starter-soul.md" });
    expect(typeof result.name).toBe("string");
    expect(result.name.length).toBeGreaterThan(0);
    expect(typeof result.version).toBe("string");
    expect(Array.isArray(result.capabilities)).toBe(true);
    expect(Array.isArray(result.refusals)).toBe(true);
    expect(result.raw_markdown.length).toBeGreaterThan(0);
    expect(result.raw_markdown).toContain("---");
  });

  it("soulState accepts a bare name without .md", () => {
    const result = soulState({ soul_path: "starter-soul" });
    expect(result.name).toBeTruthy();
  });

  it("soulState defaults to starter-soul.md", () => {
    const withDefault = soulState({});
    const explicit = soulState({ soul_path: "starter-soul.md" });
    expect(withDefault.name).toBe(explicit.name);
  });

  it("soulState throws for a missing soul", () => {
    expect(() => soulState({ soul_path: "does-not-exist.md" })).toThrow();
  });

  it("soulIntro returns ≤200 words", () => {
    const intro = soulIntro({});
    const wordCount = intro.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(200);
  });

  it("listSouls returns the known example souls", () => {
    const souls = listSouls();
    expect(souls).toContain("starter-soul");
    expect(souls.length).toBeGreaterThan(5);
  });
});

// ── memory handlers ───────────────────────────────────────────────────────────

describe("memory handlers", () => {
  const testDir = join(tmpdir(), `soulforge-mcp-test-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    process.env["SOULFORGE_MEMORY_DIR"] = testDir;
  });

  it("memoryWrite persists a record and returns an id", () => {
    const result = memoryWrite(
      { content: "test memory content", tags: ["test"], caller_id: "test-agent" },
      [] // empty allowed list = open writes
    );
    expect(typeof result.record_id).toBe("string");
    expect(result.record_id.length).toBe(36); // UUID
    expect(typeof result.created_at).toBe("string");
  });

  it("memoryWrite rejects an unauthorized caller", () => {
    expect(() =>
      memoryWrite(
        { content: "unauthorized", caller_id: "evil-agent" },
        ["trusted-agent"] // only trusted-agent is allowed
      )
    ).toThrow(/allowed_callers/);
  });

  it("memoryWrite allows any caller when allowed list is empty", () => {
    const result = memoryWrite(
      { content: "open write", caller_id: "anyone" },
      []
    );
    expect(result.record_id).toBeTruthy();
  });

  it("memoryRecall returns records after writes", () => {
    memoryWrite(
      { content: "the quick brown fox", tags: ["animals"], caller_id: "test" },
      []
    );
    const result = memoryRecall({ query: "brown fox", k: 5 });
    expect(Array.isArray(result.records)).toBe(true);
    expect(result.total_searched).toBeGreaterThan(0);
  });

  it("recentMemory returns most-recent records first", () => {
    const records = recentMemory(3);
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeLessThanOrEqual(3);
    if (records.length >= 2) {
      expect(new Date(records[0]!.created_at).getTime()).toBeGreaterThanOrEqual(
        new Date(records[1]!.created_at).getTime()
      );
    }
  });
});
