import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { LongTermMemoryStore } from "./long-term.js";
import type { Clock } from "./types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("LongTermMemoryStore", () => {
  it("persists key/value entries with tags", () => {
    const dbPath = makeDbPath();
    const store = new LongTermMemoryStore(dbPath);

    store.put({
      key: "preference:tone",
      value: { tone: "terse" },
      tags: ["preference", "voice"]
    });
    store.close();

    const reopened = new LongTermMemoryStore(dbPath);
    expect(reopened.get("preference:tone")?.value).toEqual({ tone: "terse" });
    expect(reopened.get("preference:tone")?.provenance.schema_version).toBe("memory-record.v1");
    expect(reopened.get("preference:tone")?.provenance.generated_at).toMatch(/^20\d\d-/);
    expect(reopened.list({ tag: "voice" }).map((entry) => entry.key)).toEqual(["preference:tone"]);
    reopened.close();
  });

  it("honors optional TTL", () => {
    let now = new Date("2026-05-17T00:00:00.000Z");
    const clock: Clock = { now: () => now };
    const store = new LongTermMemoryStore(makeDbPath(), clock);

    store.put({ key: "temporary", value: "vanishes", ttlMs: 1000 });
    expect(store.get("temporary")?.value).toBe("vanishes");

    now = new Date("2026-05-17T00:00:02.000Z");
    expect(store.get("temporary")).toBeNull();
    store.close();
  });

  it("updates duplicate keys without creating a second record", () => {
    const store = new LongTermMemoryStore(makeDbPath());

    const first = store.put({ key: "preference", value: "terse", tags: ["profile"] });
    const second = store.put({ key: "preference", value: "detailed", tags: ["profile"] });

    expect(second.id).toBe(first.id);
    expect(store.get("preference")?.value).toBe("detailed");
    expect(store.list()).toHaveLength(1);
    store.close();
  });
});

function makeDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "soulforge-long-term-"));
  tempDirs.push(dir);
  return join(dir, "memory.sqlite");
}
