import { describe, expect, it } from "vitest";
import { scoreGolden } from "./index.js";
import { validateJudgeVerdict } from "./judge.js";
import type { GoldenCase, SoulMetadata } from "../src/types.js";

const soul: SoulMetadata = {
  name: "starter",
  version: "0.1.0",
  soul_version: "starter@0.1.0",
  refuses: [],
  content: "",
  path: "souls/examples/starter-soul.md"
};

describe("scoreGolden", () => {
  it("scores hard assertions, exact matches, semantic matches, and judge verdicts", () => {
    const golden: GoldenCase = {
      id: "g1",
      input: "hello",
      expected_behavior: {
        summary: "honest scope concrete verified",
        replay_output: "honest scope concrete verified"
      },
      criteria: [
        { name: "hard", scorer: "hard_assertion", must_include: ["honest"], must_not_include: ["fake"] },
        { name: "exact", scorer: "exact", exact_match: "honest scope concrete verified" },
        { name: "semantic", scorer: "semantic", semantic_keywords: ["scope", "verified"], min_score: 1 },
        { name: "judge", scorer: "llm_judge", rubric: "honest scope concrete verified", min_score: 0.7 }
      ],
      allowed_tools: [],
      refusal_expected: false,
      tags: ["test"]
    };

    const result = scoreGolden(soul, golden, golden.expected_behavior.replay_output);

    expect(result.passed).toBe(true);
    expect(result.details).toHaveLength(4);
  });

  it("schema-validates judge output", () => {
    expect(() => validateJudgeVerdict({ verdict: "maybe", score: 2, reason: "", judge_soul_version: "" })).toThrow(
      /schema validation/
    );
  });
});
