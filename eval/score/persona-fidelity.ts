/**
 * Persona Fidelity Scorer
 *
 * Evaluates whether an agent's output matches the personality declared in its soul.
 * Parses Voice, Values, and Refuses sections from soul markdown and applies
 * deterministic signal checks against agent output.
 *
 * Standalone — no model or API required.
 *
 * Signal categories:
 *   - voice:   checks derived from the soul's # Voice section bullets
 *   - values:  checks derived from the soul's # Values section bullets
 *   - refuses: checks that output doesn't violate declared refusal conditions
 *
 * Usage:
 *   import { scorePersonaFidelity } from "./persona-fidelity.js";
 *   const report = scorePersonaFidelity(soul.content, output);
 */

import type { SoulMetadata } from "../src/types.js";

// ─── Public types ────────────────────────────────────────────────────────────

export interface PersonaSignal {
  readonly source: "voice" | "values" | "refuses";
  readonly rule: string;
  readonly passed: boolean;
  readonly score: number;
  readonly detail: string;
}

export interface PersonaFidelityReport {
  readonly soul_name: string;
  readonly soul_version: string;
  readonly overall_score: number;
  readonly passed: boolean;
  readonly min_score: number;
  readonly signals: readonly PersonaSignal[];
  readonly voice_score: number;
  readonly values_score: number;
  readonly refuses_score: number;
  /** Weighted breakdown per section */
  readonly section_weights: {
    readonly voice: number;
    readonly values: number;
    readonly refuses: number;
  };
}

// Section weights — refuses violations are treated as blocking
const SECTION_WEIGHTS = { voice: 0.35, values: 0.25, refuses: 0.4 } as const;

// Default passing threshold
const DEFAULT_MIN_SCORE = 0.6;

// ─── Entry point ─────────────────────────────────────────────────────────────

export function scorePersonaFidelity(
  soul: SoulMetadata,
  output: string,
  minScore = DEFAULT_MIN_SCORE
): PersonaFidelityReport {
  const soulContent = soul.content;

  const voiceSection = extractSection(soulContent, "Voice");
  const valuesSection = extractSection(soulContent, "Values");
  const refusesFrontmatter = soul.refuses;

  const voiceSignals = scoreVoice(voiceSection, output);
  const valuesSignals = scoreValues(valuesSection, output);
  const refusesSignals = scoreRefuses(refusesFrontmatter, output);

  const voiceScore = avgScore(voiceSignals);
  const valuesScore = avgScore(valuesSignals);
  const refusesScore = avgScore(refusesSignals);

  const overall =
    voiceScore * SECTION_WEIGHTS.voice +
    valuesScore * SECTION_WEIGHTS.values +
    refusesScore * SECTION_WEIGHTS.refuses;

  const signals: PersonaSignal[] = [...voiceSignals, ...valuesSignals, ...refusesSignals];

  return {
    soul_name: soul.name,
    soul_version: soul.soul_version,
    overall_score: round(overall),
    passed: overall >= minScore,
    min_score: minScore,
    signals,
    voice_score: round(voiceScore),
    values_score: round(valuesScore),
    refuses_score: round(refusesScore),
    section_weights: SECTION_WEIGHTS
  };
}

// ─── Voice signals ────────────────────────────────────────────────────────────

/**
 * Extracts voice trait bullets from the soul and maps each to a check.
 * For generic bullets, applies heuristic sentence-length and hedging checks.
 * For known keywords, applies targeted rules.
 */
function scoreVoice(voiceSection: string, output: string): PersonaSignal[] {
  if (!voiceSection.trim()) return [];

  const signals: PersonaSignal[] = [];
  const bullets = extractBullets(voiceSection);
  const lower = output.toLowerCase();

  // Track which named checks we've applied so generic checks don't double-count
  const applied = new Set<string>();

  for (const bullet of bullets) {
    const b = bullet.toLowerCase();

    if ((b.includes("direct") || b.includes("short sentence") || b.includes("subject-verb")) && !applied.has("directness")) {
      applied.add("directness");
      signals.push(checkDirectness(output));
    }

    if ((b.includes("hedg") || b.includes("no hedg") || b.includes("without hedg")) && !applied.has("hedging")) {
      applied.add("hedging");
      signals.push(checkHedging(output, true)); // penalize hedging
    }

    if ((b.includes("terse") || b.includes("concise") || b.includes("brief")) && !applied.has("terseness")) {
      applied.add("terseness");
      signals.push(checkTerseness(output));
    }

    if ((b.includes("specific") || b.includes("concrete") || b.includes("example")) && !applied.has("concreteness")) {
      applied.add("concreteness");
      signals.push(checkConcreteness(output));
    }

    if ((b.includes("structured") || b.includes("rubric-anchor") || b.includes("output-shaped")) && !applied.has("structure")) {
      applied.add("structure");
      signals.push(checkStructure(output));
    }

    if ((b.includes("calibrat") || b.includes("symmetric") || b.includes("neutral")) && !applied.has("calibration")) {
      applied.add("calibration");
      signals.push(checkCalibration(output));
    }
  }

  // If no named checks fired, apply baseline directness + hedging as generic voice checks
  if (signals.length === 0) {
    signals.push(checkDirectness(output));
    signals.push(checkHedging(output, false));
  }

  // Always check for excessive preamble regardless of voice bullets
  const preambleWords = ["certainly", "absolutely", "great question", "of course", "sure thing", "happy to help", "i'd be happy", "i'm glad"];
  const hasPreamble = preambleWords.some((p) => lower.startsWith(p) || lower.includes(`\n${p}`));
  signals.push({
    source: "voice",
    rule: "No sycophantic preamble",
    passed: !hasPreamble,
    score: hasPreamble ? 0 : 1,
    detail: hasPreamble ? "Output opens with sycophantic filler." : "No sycophantic opener detected."
  });

  return signals;
}

function checkDirectness(output: string): PersonaSignal {
  const sentences = splitSentences(output);
  if (sentences.length === 0) {
    return { source: "voice", rule: "Direct sentences", passed: true, score: 1, detail: "No sentences to evaluate." };
  }
  const avgLen = sentences.reduce((sum, s) => sum + wordCount(s), 0) / sentences.length;
  // Target: avg sentence length under 20 words
  const score = avgLen <= 12 ? 1 : avgLen <= 20 ? 0.7 : avgLen <= 30 ? 0.4 : 0.1;
  return {
    source: "voice",
    rule: "Direct sentences",
    passed: score >= 0.7,
    score,
    detail: `Avg sentence length: ${avgLen.toFixed(1)} words (target ≤ 20).`
  };
}

function checkHedging(output: string, penalize: boolean): PersonaSignal {
  const hedges = ["perhaps", "maybe", "might be", "could be", "sort of", "kind of", "i think", "i believe", "i suppose", "i guess", "probably", "possibly", "arguably", "it seems", "it appears", "you could argue"];
  const lower = output.toLowerCase();
  const found = hedges.filter((h) => lower.includes(h));
  const score = found.length === 0 ? 1 : penalize ? Math.max(0, 1 - found.length * 0.25) : 0.8;
  return {
    source: "voice",
    rule: "Avoid hedging language",
    passed: score >= 0.6,
    score,
    detail: found.length === 0 ? "No hedging phrases detected." : `Hedging phrases found: ${found.slice(0, 3).join(", ")}.`
  };
}

function checkTerseness(output: string): PersonaSignal {
  const wc = wordCount(output);
  // Terse: under 150 words is great, 150-300 acceptable, 300+ penalized
  const score = wc <= 150 ? 1 : wc <= 300 ? 0.7 : wc <= 500 ? 0.4 : 0.2;
  return {
    source: "voice",
    rule: "Terse output",
    passed: score >= 0.7,
    score,
    detail: `Word count: ${String(wc)} (target ≤ 300 for terse voice).`
  };
}

function checkConcreteness(output: string): PersonaSignal {
  // Concreteness signals: code blocks, URLs, numbers, quoted examples, named items
  const hasCode = /```/.test(output) || /`[^`]+`/.test(output);
  const hasNumber = /\b\d+(\.\d+)?\b/.test(output);
  const hasQuote = /["']/.test(output);
  const signals = [hasCode, hasNumber, hasQuote].filter(Boolean).length;
  const score = signals >= 2 ? 1 : signals === 1 ? 0.7 : 0.3;
  return {
    source: "voice",
    rule: "Concrete examples",
    passed: score >= 0.7,
    score,
    detail: `Concreteness signals: code=${String(hasCode)}, numbers=${String(hasNumber)}, quotes=${String(hasQuote)}.`
  };
}

function checkStructure(output: string): PersonaSignal {
  // Structured output uses headings, bullets, or labeled fields
  const hasHeading = /^#{1,4}\s/m.test(output);
  const hasBullet = /^[-*•]\s/m.test(output);
  const hasLabel = /^[a-zA-Z][a-zA-Z0-9_\s]*:/m.test(output);
  const structured = hasHeading || hasBullet || hasLabel;
  return {
    source: "voice",
    rule: "Structured output",
    passed: structured,
    score: structured ? 1 : 0.5,
    detail: structured ? `Structure detected: heading=${String(hasHeading)}, bullet=${String(hasBullet)}, label=${String(hasLabel)}.` : "No structural markers found."
  };
}

function checkCalibration(output: string): PersonaSignal {
  // Calibrated output avoids absolute certainty about uncertain topics
  const absolutePhrases = ["definitely", "certainly", "guaranteed", "always", "never", "100%", "without a doubt"];
  const lower = output.toLowerCase();
  const found = absolutePhrases.filter((p) => lower.includes(p));
  // Allow 1 absolute phrase; penalize more
  const score = found.length === 0 ? 1 : found.length === 1 ? 0.8 : Math.max(0.2, 1 - found.length * 0.2);
  return {
    source: "voice",
    rule: "Calibrated certainty",
    passed: score >= 0.6,
    score,
    detail: found.length === 0 ? "No overconfident phrases." : `Absolute phrases: ${found.slice(0, 3).join(", ")}.`
  };
}

// ─── Values signals ───────────────────────────────────────────────────────────

function scoreValues(valuesSection: string, output: string): PersonaSignal[] {
  if (!valuesSection.trim()) return [];

  const signals: PersonaSignal[] = [];
  const bullets = extractBullets(valuesSection);
  const lower = output.toLowerCase();
  const applied = new Set<string>();

  for (const bullet of bullets) {
    const b = bullet.toLowerCase();

    if ((b.includes("truth") || b.includes("honest") || b.includes("accurate")) && !applied.has("honesty")) {
      applied.add("honesty");
      // Truth-first: avoid "I'm not sure but..." followed by a confident claim
      const truthSignal = !(/i'm not sure|i don't know/.test(lower) && /so i think|so it must|so it is/.test(lower));
      signals.push({
        source: "values",
        rule: "Truth before reassurance",
        passed: truthSignal,
        score: truthSignal ? 1 : 0.3,
        detail: truthSignal ? "No unsupported confident claims after uncertainty hedges." : "Uncertain opener followed by confident claim — truth integrity risk."
      });
    }

    if ((b.includes("concret") || b.includes("example") || b.includes("working")) && !applied.has("grounding")) {
      applied.add("grounding");
      const hasCode = /```/.test(output) || /`[^`]+`/.test(output);
      const hasExample = /for example|e\.g\.|for instance|such as|\blike\b/.test(lower);
      const grounded = hasCode || hasExample;
      signals.push({
        source: "values",
        rule: "Concrete before abstract",
        passed: grounded,
        score: grounded ? 1 : 0.5,
        detail: grounded ? "Concrete examples present (code or explicit examples)." : "No concrete examples found — abstract claims only."
      });
    }

    if ((b.includes("reader") || b.includes("busy") || b.includes("earn") || b.includes("sentence")) && !applied.has("economy")) {
      applied.add("economy");
      const wc = wordCount(output);
      const avgSentLen = avgSentenceLength(output);
      const economical = wc <= 250 && avgSentLen <= 18;
      signals.push({
        source: "values",
        rule: "Sentence economy",
        passed: economical,
        score: economical ? 1 : wc <= 400 ? 0.7 : 0.4,
        detail: `${String(wc)} words, avg sentence ${avgSentLen.toFixed(1)} words.`
      });
    }

    if ((b.includes("scope") || b.includes("limit") || b.includes("out of scope")) && !applied.has("scope")) {
      applied.add("scope");
      // If the output claims capabilities, check it doesn't contradict scope
      const overclaims = /i can do anything|i handle all|i support everything|no limit/i.test(output);
      signals.push({
        source: "values",
        rule: "Scope honesty",
        passed: !overclaims,
        score: overclaims ? 0.1 : 1,
        detail: overclaims ? "Output contains unlimited-capability claims." : "No unlimited-scope overclaiming detected."
      });
    }
  }

  return signals;
}

// ─── Refuses signals ──────────────────────────────────────────────────────────

/**
 * For each refusal declaration, check output doesn't contain that behavior.
 * Each refusal is a sentence like "Generating agent output" or "Inventing capabilities".
 * Extract key nouns and check the output doesn't clearly perform that action.
 */
function scoreRefuses(refuses: readonly string[], output: string): PersonaSignal[] {
  if (refuses.length === 0) return [];

  const lower = output.toLowerCase();
  const signals: PersonaSignal[] = [];

  for (const refusal of refuses) {
    const r = refusal.toLowerCase();
    const key = extractRefusalKey(r);
    if (!key) continue;

    // Build negative indicators: if the output explicitly performs the refused action
    const violated = detectRefusalViolation(key, lower);
    signals.push({
      source: "refuses",
      rule: `Does not: ${refusal.slice(0, 60)}`,
      passed: !violated,
      score: violated ? 0 : 1,
      detail: violated ? `Output appears to violate refusal "${refusal.slice(0, 40)}…"` : "Refusal condition not violated."
    });
  }

  return signals;
}

function extractRefusalKey(refusal: string): string | null {
  // Extract key action nouns from refusal sentences
  const keyMap: Record<string, string> = {
    "creative": "poem|story|fiction|creative",
    "invent": "invented|made up|fabricat",
    "guess": "i guess|guessing",
    "url": "https?://",
    "code": "```",
    "agent output": "generated output|model output",
    "scoring": "score|verdict"
  };

  for (const [trigger, pattern] of Object.entries(keyMap)) {
    if (refusal.includes(trigger)) return pattern;
  }

  // Generic: use first meaningful word from refusal
  const words = refusal.match(/\b[a-z]{4,}\b/g) ?? [];
  const stopWords = new Set(["that", "this", "from", "with", "when", "without", "unless", "before", "after", "every", "should"]);
  const key = words.find((w) => !stopWords.has(w));
  return key ?? null;
}

function detectRefusalViolation(key: string, lower: string): boolean {
  try {
    return new RegExp(key).test(lower);
  } catch {
    return lower.includes(key);
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function extractSection(content: string, heading: string): string {
  // Match `# Heading` — case-insensitive, H1 to H3
  const re = new RegExp(`^#{1,3}\\s+${heading}\\s*$`, "im");
  const match = re.exec(content);
  if (!match?.index === undefined) return "";
  if (!match) return "";
  const start = match.index + match[0].length;
  // Find next heading at same or higher level
  const nextHeading = /^#{1,3}\s/m.exec(content.slice(start));
  const end = nextHeading ? start + nextHeading.index : content.length;
  return content.slice(start, end).trim();
}

function extractBullets(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").replace(/\*\*/g, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation; ignore code blocks
  const noCode = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
  return noCode.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 4);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

function avgSentenceLength(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;
  return sentences.reduce((sum, s) => sum + wordCount(s), 0) / sentences.length;
}

function avgScore(signals: readonly PersonaSignal[]): number {
  if (signals.length === 0) return 1; // no signals = no penalty
  return signals.reduce((sum, s) => sum + s.score, 0) / signals.length;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
