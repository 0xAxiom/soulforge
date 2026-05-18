import { describe, expect, it } from "vitest";
import { epochReduce, scoreGolden } from "./index.js";
import { validateJudgeVerdict } from "./judge.js";
import type { EvalResult, GoldenCase, SoulMetadata } from "../src/types.js";

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

describe("epochReduce", () => {
  const baseResult: EvalResult = {
    golden_id: "g1",
    soul_version: "starter@0.1.0",
    input: "hello",
    output: "world",
    passed: true,
    score: 1,
    details: [],
    cache_hit: false,
    trace_id: "t1",
    session_id: "s1",
    turn_id: "turn-1",
    duration_ms: 10
  };

  it("returns single run unchanged (modulo output prefix)", () => {
    const result = epochReduce([[baseResult]]);
    expect(result).toHaveLength(1);
    expect(result[0]!.score).toBe(1);
    expect(result[0]!.passed).toBe(true);
  });

  it("mean-reduces scores across runs", () => {
    const run1 = [{ ...baseResult, score: 0.4, passed: false }];
    const run2 = [{ ...baseResult, score: 0.8, passed: true }];
    const run3 = [{ ...baseResult, score: 0.9, passed: true }];
    const [result] = epochReduce([run1, run2, run3], "mean");
    expect(result!.score).toBeCloseTo(0.7, 5);
    expect(result!.passed).toBe(true);
  });

  it("median-reduces scores across runs", () => {
    const run1 = [{ ...baseResult, score: 0.1, passed: false }];
    const run2 = [{ ...baseResult, score: 0.6, passed: true }];
    const run3 = [{ ...baseResult, score: 0.9, passed: true }];
    const [result] = epochReduce([run1, run2, run3], "median");
    expect(result!.score).toBeCloseTo(0.6, 5);
    expect(result!.passed).toBe(true);
  });

  it("majority-vote determines passed from N runs", () => {
    const pass = { ...baseResult, passed: true, score: 0.9 };
    const fail = { ...baseResult, passed: false, score: 0.3 };
    const twoFail = epochReduce([[pass], [fail], [fail]], "mean");
    expect(twoFail[0]!.passed).toBe(false);
    const twoPass = epochReduce([[pass], [pass], [fail]], "mean");
    expect(twoPass[0]!.passed).toBe(true);
  });
});
