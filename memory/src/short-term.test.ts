import { describe, expect, it } from "vitest";
import { ShortTermMemory } from "./short-term.js";

describe("ShortTermMemory", () => {
  it("stores typed values in-process", () => {
    const memory = new ShortTermMemory<{ readonly topic: string; readonly count: number }>();

    memory.set("latest", { topic: "memory", count: 2 });

    expect(memory.get("latest")).toEqual({ topic: "memory", count: 2 });
    expect(memory.entries()).toHaveLength(1);
  });

  it("deletes and clears entries", () => {
    const memory = new ShortTermMemory<string>();
    memory.set("a", "one");
    memory.set("b", "two");

    expect(memory.delete("a")).toBe(true);
    expect(memory.has("a")).toBe(false);

    memory.clear();
    expect(memory.entries()).toEqual([]);
  });
});
