import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asOptionalStringArray, asStringArray, isJsonObject, readJsonFile } from "../src/json.js";
import type { GoldenCase, GoldenCriterion, GoldenExpectedBehavior, JsonObject, ScorerKind } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));

export function defaultGoldensRoot(): string {
  return here;
}

export function loadGoldensForSoul(soulName: string, root = defaultGoldensRoot()): GoldenCase[] {
  const dir = join(root, soulName);
  const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
  return files.map((file) => parseGolden(readJsonFile(join(dir, file)), join(dir, file)));
}

function parseGolden(value: unknown, path: string): GoldenCase {
  if (!isJsonObject(value)) throw new Error(`${path} must contain a JSON object`);
  const expected = value.expected_behavior;
  if (!isJsonObject(expected)) throw new Error(`${path} expected_behavior must be an object`);
  const criteriaValue = value.criteria;
  if (!Array.isArray(criteriaValue)) throw new Error(`${path} criteria must be an array`);
  const base = {
    id: readString(value, "id", path),
    input: readString(value, "input", path),
    expected_behavior: parseExpected(expected, path),
    criteria: criteriaValue.map((criterion, index) => parseCriterion(criterion, `${path} criteria[${String(index)}]`)),
    allowed_tools: asStringArray(value.allowed_tools, `${path} allowed_tools`),
    refusal_expected: readBoolean(value, "refusal_expected", path),
    tags: asStringArray(value.tags, `${path} tags`)
  };
  const golden = isJsonObject(value.tool_versions) ? { ...base, tool_versions: value.tool_versions } : base;
  if (golden.criteria.length === 0) throw new Error(`${path} must include at least one criterion`);
  return golden;
}

function parseExpected(value: JsonObject, path: string): GoldenExpectedBehavior {
  return {
    summary: readString(value, "summary", path),
    replay_output: readString(value, "replay_output", path)
  };
}

function parseCriterion(value: unknown, path: string): GoldenCriterion {
  if (!isJsonObject(value)) throw new Error(`${path} must be an object`);
  const scorer = readScorer(value, path);
  const optional: MutableCriterion = {};
  const weight = readOptionalNumber(value, "weight", path);
  const mustInclude = asOptionalStringArray(value.must_include, `${path} must_include`);
  const mustNotInclude = asOptionalStringArray(value.must_not_include, `${path} must_not_include`);
  const exactMatch = readOptionalString(value, "exact_match", path);
  const semanticKeywords = asOptionalStringArray(value.semantic_keywords, `${path} semantic_keywords`);
  const rubric = readOptionalString(value, "rubric", path);
  const minScore = readOptionalNumber(value, "min_score", path);
  if (weight !== undefined) optional.weight = weight;
  if (mustInclude !== undefined) optional.must_include = mustInclude;
  if (mustNotInclude !== undefined) optional.must_not_include = mustNotInclude;
  if (exactMatch !== undefined) optional.exact_match = exactMatch;
  if (semanticKeywords !== undefined) optional.semantic_keywords = semanticKeywords;
  if (rubric !== undefined) optional.rubric = rubric;
  if (minScore !== undefined) optional.min_score = minScore;
  return {
    name: readString(value, "name", path),
    scorer,
    ...optional
  };
}

type MutableCriterion = {
  -readonly [Key in keyof GoldenCriterion]?: GoldenCriterion[Key];
};

function readString(value: JsonObject, key: string, path: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) throw new Error(`${path} ${key} must be a non-empty string`);
  return field;
}

function readOptionalString(value: JsonObject, key: string, path: string): string | undefined {
  const field = value[key];
  if (field === undefined) return undefined;
  if (typeof field !== "string") throw new Error(`${path} ${key} must be a string`);
  return field;
}

function readBoolean(value: JsonObject, key: string, path: string): boolean {
  const field = value[key];
  if (typeof field !== "boolean") throw new Error(`${path} ${key} must be a boolean`);
  return field;
}

function readOptionalNumber(value: JsonObject, key: string, path: string): number | undefined {
  const field = value[key];
  if (field === undefined) return undefined;
  if (typeof field !== "number") throw new Error(`${path} ${key} must be a number`);
  return field;
}

function readScorer(value: JsonObject, path: string): ScorerKind {
  const scorer = readString(value, "scorer", path);
  if (scorer === "hard_assertion" || scorer === "exact" || scorer === "semantic" || scorer === "llm_judge") {
    return scorer;
  }
  throw new Error(`${path} scorer is not supported`);
}

export function folderNameForSoulPath(path: string): string {
  return basename(path).replace(/-soul\.md$/, "").replace(/\.md$/, "");
}
