/**
 * Demonstrates WorkflowValidator catching wiring errors before execution.
 *
 * Run: tsx tools/workflow-validator/examples/validate-demo.ts
 */

import { WorkflowValidationError, WorkflowValidator } from "../src/index.js";

const validator = new WorkflowValidator();

// --- Example 1: Valid workflow ---
console.log("=== Example 1: Valid 3-step pipeline ===");
const valid = validator.validate({
  pipelineId: "text-pipeline",
  steps: [
    { name: "fetch", output_event_type: "raw_content", run: async () => ({ content: "" }) },
    { name: "extract-keywords", output_event_type: "keywords", run: async () => ({ keywords: [] }) },
    { name: "summarize", output_event_type: "summary", run: async () => ({ summary: "" }) }
  ]
});
console.log(`valid: ${valid.valid}, steps: ${valid.step_count}, errors: ${valid.errors.length}`);
// valid: true, steps: 3, errors: 0

// --- Example 2: Duplicate output_event_type ---
console.log("\n=== Example 2: Duplicate output_event_type ===");
const dupEvent = validator.validate({
  pipelineId: "broken-pipeline",
  steps: [
    { name: "step-a", output_event_type: "processed", run: async () => ({}) },
    { name: "step-b", output_event_type: "processed", run: async () => ({}) } // same event type
  ]
});
console.log(`valid: ${dupEvent.valid}`);
dupEvent.errors.forEach((e) => console.log(`  [${e.code}] ${e.message}`));

// --- Example 3: Unsafe pipelineId (path traversal attempt) ---
console.log("\n=== Example 3: Path-unsafe pipelineId ===");
const unsafeId = validator.validate({
  pipelineId: "../../../etc/passwd",
  steps: [{ name: "exfil", output_event_type: "data", run: async () => ({}) }]
});
console.log(`valid: ${unsafeId.valid}`);
unsafeId.errors.forEach((e) => console.log(`  [${e.code}] ${e.message}`));

// --- Example 4: assertValid throws ---
console.log("\n=== Example 4: assertValid on invalid definition ===");
try {
  validator.assertValid({
    pipelineId: "p",
    steps: [] // empty — will throw
  });
} catch (err) {
  if (err instanceof WorkflowValidationError) {
    console.log(`Caught WorkflowValidationError: ${err.message}`);
    console.log(`Error codes: ${err.result.errors.map((e) => e.code).join(", ")}`);
  }
}

// --- Example 5: Warning (step name matches pipelineId) ---
console.log("\n=== Example 5: Warning — step name matches pipelineId ===");
const warned = validator.validate({
  pipelineId: "fetch",
  steps: [{ name: "fetch", output_event_type: "raw", run: async () => ({}) }]
});
console.log(`valid: ${warned.valid}, warnings: ${warned.warnings.length}`);
warned.warnings.forEach((w) => console.log(`  [${w.code}] ${w.message}`));
