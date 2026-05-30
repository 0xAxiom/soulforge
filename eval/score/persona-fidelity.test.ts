import { describe, it, expect } from "vitest";
import { scorePersonaFidelity, type PersonaFidelityReport } from "./persona-fidelity.js";
import type { SoulMetadata } from "../src/types.js";

// Minimal soul fixture
function makeSoul(overrides: Partial<SoulMetadata> = {}): SoulMetadata {
  return {
    name: "test-soul",
    version: "0.1.0",
    soul_version: "test-soul@0.1.0",
    refuses: ["Pretending to have capabilities it doesn't have", "Generating creative fiction"],
    content: `---
name: test-soul
version: 0.1.0
refuses:
  - Pretending to have capabilities it doesn't have
  - Generating creative fiction
---

# Voice

- **Direct.** Short sentences. Subject-verb-object.
- **Specific.** Names a concrete example before giving a rule.
- **Honest about scope.** Says "I don't do that" without hedging.

# Values

- **Truth before reassurance.**
- **Concreteness before completeness.** A working example beats a complete spec.
- **The reader is busy.** Every sentence earns its place.
`,
    path: "/tmp/test-soul.md",
    ...overrides
  };
}

describe("scorePersonaFidelity", () => {
  it("returns a valid report structure", () => {
    const soul = makeSoul();
    const report = scorePersonaFidelity(soul, "Use \`npm install\` to add the package. Run \`npm test\` to verify.");
    expect(report.soul_name).toBe("test-soul");
    expect(report.soul_version).toBe("test-soul@0.1.0");
    expect(report.overall_score).toBeGreaterThanOrEqual(0);
    expect(report.overall_score).toBeLessThanOrEqual(1);
    expect(report.signals.length).toBeGreaterThan(0);
    expect(["voice", "values", "refuses"]).toContain(report.signals[0]?.source);
  });

  it("passes for direct, concrete output", () => {
    const soul = makeSoul();
    const output = `Run \`npm install\`. That installs the package. Next run \`npm test\` to verify. Done.`;
    const report = scorePersonaFidelity(soul, output);
    expect(report.passed).toBe(true);
    expect(report.overall_score).toBeGreaterThan(0.6);
  });

  it("penalizes sycophantic preamble", () => {
    const soul = makeSoul();
    const output = "Certainly! Great question! Here's how you can do it. Maybe you could try running the tests.";
    const report = scorePersonaFidelity(soul, output);
    const preambleSignal = report.signals.find((s) => s.rule === "No sycophantic preamble");
    expect(preambleSignal).toBeDefined();
    expect(preambleSignal?.passed).toBe(false);
  });

  it("penalizes heavy hedging when voice declares direct", () => {
    const soul = makeSoul();
    const output = "Perhaps you might want to consider maybe installing the package. I think it could possibly work.";
    const report = scorePersonaFidelity(soul, output);
    const hedgeSignal = report.signals.find((s) => s.rule === "Avoid hedging language");
    expect(hedgeSignal).toBeDefined();
    expect(hedgeSignal?.score).toBeLessThan(0.8);
  });

  it("detects refusal violation for creative fiction", () => {
    const soul = makeSoul();
    const output = "Once upon a time there was a developer who wrote a beautiful poem about TypeScript...";
    const report = scorePersonaFidelity(soul, output);
    const refusesScore = report.refuses_score;
    // At least one refusal signal should fail
    const failedRefusal = report.signals.filter((s) => s.source === "refuses" && !s.passed);
    expect(failedRefusal.length).toBeGreaterThan(0);
  });

  it("handles souls with no voice or values sections gracefully", () => {
    const soul = makeSoul({
      content: `---
name: minimal
version: 0.1.0
refuses: []
---

# Identity

A minimal soul.
`,
      refuses: []
    });
    const report = scorePersonaFidelity(soul, "Hello world.");
    expect(report.overall_score).toBeGreaterThanOrEqual(0);
    expect(report.refuses_score).toBe(1); // no refusals = no penalty
  });

  it("scores section weights correctly", () => {
    const soul = makeSoul();
    const report = scorePersonaFidelity(soul, "Yes.");
    expect(report.section_weights.voice + report.section_weights.values + report.section_weights.refuses).toBeCloseTo(1);
  });

  it("rewards concrete output with code", () => {
    const soul = makeSoul();
    const codeOutput = "Install via:\n```\nnpm install soulforge\n```\nThen import from the package.";
    const report = scorePersonaFidelity(soul, codeOutput);
    const concreteSignal = report.signals.find((s) => s.rule === "Concrete examples" || s.rule === "Concrete before abstract");
    expect(concreteSignal?.passed).toBe(true);
  });

  it("respects custom minScore threshold", () => {
    const soul = makeSoul();
    const output = "Run it.";
    const reportStrict = scorePersonaFidelity(soul, output, 0.99);
    const reportLoose = scorePersonaFidelity(soul, output, 0.1);
    expect(reportStrict.passed).toBe(false);
    expect(reportLoose.passed).toBe(true);
  });
});
