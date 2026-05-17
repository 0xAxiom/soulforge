import type { GoldenCase, GoldenCriterion, ScoreDetail, SoulMetadata } from "../src/types.js";
import { DeterministicJudgeModel, type JudgeModel } from "./judge.js";

export const SCORER_VERSION = "score.v1";

export interface ScoreOptions {
  readonly judge?: JudgeModel;
}

export function scoreGolden(
  soul: SoulMetadata,
  golden: GoldenCase,
  output: string,
  options: ScoreOptions = {}
): { readonly passed: boolean; readonly score: number; readonly details: readonly ScoreDetail[] } {
  const judge = options.judge ?? new DeterministicJudgeModel();
  const details = golden.criteria.map((criterion) => scoreCriterion(soul, golden, criterion, output, judge));
  const weightTotal = golden.criteria.reduce((sum, criterion) => sum + (criterion.weight ?? 1), 0);
  const score =
    weightTotal === 0
      ? 0
      : details.reduce((sum, detail, index) => sum + detail.score * (golden.criteria[index]?.weight ?? 1), 0) /
        weightTotal;
  return {
    passed: details.every((detail) => detail.passed),
    score,
    details
  };
}

function scoreCriterion(
  soul: SoulMetadata,
  golden: GoldenCase,
  criterion: GoldenCriterion,
  output: string,
  judge: JudgeModel
): ScoreDetail {
  switch (criterion.scorer) {
    case "hard_assertion":
      return scoreHardAssertion(golden, criterion, output);
    case "exact":
      return scoreExact(criterion, output);
    case "semantic":
      return scoreSemantic(criterion, output);
    case "llm_judge":
      return scoreJudge(soul, golden, criterion, output, judge);
  }
}

function scoreHardAssertion(golden: GoldenCase, criterion: GoldenCriterion, output: string): ScoreDetail {
  const lower = output.toLowerCase();
  const includes = criterion.must_include ?? [];
  const excludes = criterion.must_not_include ?? [];
  const includePass = includes.every((item) => lower.includes(item.toLowerCase()));
  const excludePass = excludes.every((item) => !lower.includes(item.toLowerCase()));
  const refusalPass = golden.refusal_expected ? /(^|\b)(no|cannot|won't|will not|refuse|out of scope)\b/i.test(output) : true;
  const passed = includePass && excludePass && refusalPass;
  return {
    criterion: criterion.name,
    scorer: criterion.scorer,
    passed,
    score: passed ? 1 : 0,
    reason: passed ? "Hard assertion passed." : "Hard assertion failed on required or forbidden text."
  };
}

function scoreExact(criterion: GoldenCriterion, output: string): ScoreDetail {
  const expected = criterion.exact_match ?? "";
  const passed = output.trim() === expected.trim();
  return {
    criterion: criterion.name,
    scorer: criterion.scorer,
    passed,
    score: passed ? 1 : 0,
    reason: passed ? "Exact output matched." : "Exact output did not match."
  };
}

function scoreSemantic(criterion: GoldenCriterion, output: string): ScoreDetail {
  const keywords = criterion.semantic_keywords ?? [];
  const lower = output.toLowerCase();
  const matched = keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
  const minScore = criterion.min_score ?? 0.75;
  const score = keywords.length === 0 ? 1 : matched.length / keywords.length;
  return {
    criterion: criterion.name,
    scorer: criterion.scorer,
    passed: score >= minScore,
    score,
    reason: `Matched ${String(matched.length)}/${String(keywords.length)} semantic keywords.`
  };
}

function scoreJudge(
  soul: SoulMetadata,
  golden: GoldenCase,
  criterion: GoldenCriterion,
  output: string,
  judge: JudgeModel
): ScoreDetail {
  const verdict = judge.judge({ soul, golden, criterion, output });
  return {
    criterion: criterion.name,
    scorer: criterion.scorer,
    passed: verdict.verdict === "pass",
    score: verdict.score,
    reason: `${verdict.judge_soul_version}: ${verdict.reason}`
  };
}
