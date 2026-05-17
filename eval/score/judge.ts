import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GoldenCase, GoldenCriterion, SoulMetadata } from "../src/types.js";

export interface JudgeVerdict {
  readonly verdict: "pass" | "partial" | "fail";
  readonly score: number;
  readonly reason: string;
  readonly judge_soul_version: string;
}

export interface JudgeInput {
  readonly soul: SoulMetadata;
  readonly golden: GoldenCase;
  readonly criterion: GoldenCriterion;
  readonly output: string;
}

export interface JudgeModel {
  judge(input: JudgeInput): JudgeVerdict;
}

const judgeVerdictSchema = {
  type: "object",
  required: ["verdict", "score", "reason", "judge_soul_version"],
  additionalProperties: false,
  properties: {
    verdict: { enum: ["pass", "partial", "fail"] },
    score: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string", minLength: 1 },
    judge_soul_version: { type: "string", minLength: 1 }
  }
};

export class DeterministicJudgeModel implements JudgeModel {
  private readonly judgeSoulVersion: string;

  constructor(judgeSoulPath = "souls/examples/eval-judge-soul.md") {
    const raw = readFileSync(resolve(judgeSoulPath), "utf8");
    const name = raw.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "eval-judge";
    const version = raw.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? "0.0.0";
    this.judgeSoulVersion = `${name}@${version}`;
  }

  judge(input: JudgeInput): JudgeVerdict {
    const rubric = input.criterion.rubric ?? input.golden.expected_behavior.summary;
    const keywords = importantWords(rubric);
    const matched = keywords.filter((word) => input.output.toLowerCase().includes(word));
    const score = keywords.length === 0 ? 1 : matched.length / keywords.length;
    const verdict = score >= (input.criterion.min_score ?? 0.7) ? "pass" : score > 0 ? "partial" : "fail";
    return validateJudgeVerdict({
      verdict,
      score,
      reason: `Rubric keyword coverage ${String(matched.length)}/${String(keywords.length)} for ${input.criterion.name}.`,
      judge_soul_version: this.judgeSoulVersion
    });
  }
}

export function validateJudgeVerdict(value: unknown): JudgeVerdict {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("verdict" in value) ||
    !("score" in value) ||
    !("reason" in value) ||
    !("judge_soul_version" in value)
  ) {
    throw new Error(`Judge output failed schema validation against ${judgeVerdictSchema.required.join(", ")}`);
  }
  const candidate = value as {
    readonly verdict: unknown;
    readonly score: unknown;
    readonly reason: unknown;
    readonly judge_soul_version: unknown;
  };
  if (candidate.verdict !== "pass" && candidate.verdict !== "partial" && candidate.verdict !== "fail") {
    throw new Error("Judge output failed schema validation: verdict");
  }
  if (typeof candidate.score !== "number" || candidate.score < 0 || candidate.score > 1) {
    throw new Error("Judge output failed schema validation: score");
  }
  if (typeof candidate.reason !== "string" || candidate.reason.length === 0) {
    throw new Error("Judge output failed schema validation: reason");
  }
  if (typeof candidate.judge_soul_version !== "string" || candidate.judge_soul_version.length === 0) {
    throw new Error("Judge output failed schema validation: judge_soul_version");
  }
  return {
    verdict: candidate.verdict,
    score: candidate.score,
    reason: candidate.reason,
    judge_soul_version: candidate.judge_soul_version
  };
}

function importantWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((word) => word.length > 3 && !STOP_WORDS.has(word));
  return [...new Set(words ?? [])].slice(0, 12);
}

const STOP_WORDS = new Set(["agent", "output", "should", "must", "with", "that", "this", "from", "when"]);
