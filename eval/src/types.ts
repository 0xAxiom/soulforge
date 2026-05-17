export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export type ScorerKind = "hard_assertion" | "exact" | "semantic" | "llm_judge";

export interface GoldenCriterion {
  readonly name: string;
  readonly scorer: ScorerKind;
  readonly weight?: number;
  readonly must_include?: readonly string[];
  readonly must_not_include?: readonly string[];
  readonly exact_match?: string;
  readonly semantic_keywords?: readonly string[];
  readonly rubric?: string;
  readonly min_score?: number;
}

export interface GoldenExpectedBehavior {
  readonly summary: string;
  readonly replay_output: string;
}

export interface GoldenCase {
  readonly id: string;
  readonly input: string;
  readonly expected_behavior: GoldenExpectedBehavior;
  readonly criteria: readonly GoldenCriterion[];
  readonly allowed_tools: readonly string[];
  readonly refusal_expected: boolean;
  readonly tags: readonly string[];
  readonly tool_versions?: JsonObject;
}

export interface SoulMetadata {
  readonly name: string;
  readonly version: string;
  readonly soul_version: string;
  readonly refuses: readonly string[];
  readonly content: string;
  readonly path: string;
}

export interface ScoreDetail {
  readonly criterion: string;
  readonly scorer: ScorerKind;
  readonly passed: boolean;
  readonly score: number;
  readonly reason: string;
}

export interface EvalResult {
  readonly golden_id: string;
  readonly soul_version: string;
  readonly input: string;
  readonly output: string;
  readonly passed: boolean;
  readonly score: number;
  readonly details: readonly ScoreDetail[];
  readonly cache_hit: boolean;
  readonly trace_id: string;
  readonly session_id: string;
  readonly turn_id: string;
  readonly duration_ms: number;
}

export interface ReplayMetadata {
  readonly mode: "golden-replay";
  readonly scorer_version: string;
  readonly cache_key: string;
  readonly cache_hit: boolean;
}
