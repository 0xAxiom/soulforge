/**
 * Example: 3-step text processing pipeline using WorkflowRunner.
 *
 * Demonstrates:
 * - step-by-step handoff data accumulation
 * - checkpoint writing to disk
 * - resume behavior (run twice: second run skips all steps)
 * - output_event_type naming (Haystack socket discipline)
 *
 * Run: tsx tools/workflow-runner/examples/text-pipeline.ts
 */

import { rmSync, existsSync } from "node:fs";
import { WorkflowRunner } from "../src/index.js";

const CHECKPOINT_DIR = ".tmp/text-pipeline-demo";

// Clean up prior run so we demo a fresh pipeline
if (existsSync(CHECKPOINT_DIR)) {
  rmSync(CHECKPOINT_DIR, { recursive: true });
}

const runner = new WorkflowRunner(CHECKPOINT_DIR);

const definition = {
  pipelineId: "text-pipeline-demo",
  steps: [
    {
      name: "fetch-content",
      output_event_type: "raw_content",
      run: async (_data: Record<string, unknown>) => {
        console.log("  [fetch-content] fetching source text...");
        // Simulate a fetch with a fixed article excerpt
        return {
          raw_content:
            "Artificial intelligence is transforming software engineering. " +
            "Agents can now write, test, and deploy code autonomously. " +
            "The key challenge is maintaining human oversight while maximizing productivity."
        };
      }
    },
    {
      name: "extract-keywords",
      output_event_type: "keywords",
      run: async (data: Record<string, unknown>) => {
        console.log("  [extract-keywords] extracting keywords from raw content...");
        const text = String(data["raw_content"] ?? "");
        // Naive keyword extraction: find capitalized multi-char words
        const keywords = [...new Set(text.match(/\b[A-Z][a-z]{3,}\b/g) ?? [])];
        return { keywords };
      }
    },
    {
      name: "summarize",
      output_event_type: "summary",
      run: async (data: Record<string, unknown>) => {
        console.log("  [summarize] building summary from keywords...");
        const keywords = (data["keywords"] as string[]) ?? [];
        const summary = `Key themes: ${keywords.slice(0, 4).join(", ")}.`;
        return { summary };
      }
    }
  ]
};

console.log("=== Run 1 (fresh) ===");
const result1 = await runner.run(definition);
console.log(`Status: ${result1.status}`);
console.log(`Steps run: ${result1.steps_run}/${result1.steps_total}`);
console.log(`Summary: ${String(result1.final_data["summary"])}`);
console.log(`Keywords: ${JSON.stringify(result1.final_data["keywords"])}`);

// Show checkpoint files
const checkpoints = runner.loadCheckpoints(definition.pipelineId, CHECKPOINT_DIR);
console.log(`\nCheckpoints written: ${checkpoints.length}`);
for (const cp of checkpoints) {
  console.log(`  [${cp.step_index}] ${cp.step_name} → ${cp.output_event_type} (${cp.wall_time_ms}ms)`);
}

console.log("\n=== Run 2 (resume — all steps already checkpointed) ===");
const result2 = await runner.run(definition);
console.log(`Status: ${result2.status}`);
console.log(`Steps run: ${result2.steps_run}/${result2.steps_total} (should be 0 — resumed from checkpoint)`);
console.log(`Resumed from step: ${result2.resumed_from_step}`);
console.log(`Summary (from checkpoint): ${String(result2.final_data["summary"])}`);
