import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkflowRunner, WorkflowShapeError } from "./index.js";

const TEST_CHECKPOINT_DIR = ".tmp/workflow-runner-test";

function freshDir(pipelineId: string): string {
  const dir = join(TEST_CHECKPOINT_DIR, pipelineId);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  return TEST_CHECKPOINT_DIR;
}

describe("WorkflowRunner", () => {
  beforeEach(() => {
    mkdirSync(TEST_CHECKPOINT_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_CHECKPOINT_DIR)) {
      rmSync(TEST_CHECKPOINT_DIR, { recursive: true });
    }
  });

  it("runs a 3-step pipeline and returns completed status", async () => {
    const runner = new WorkflowRunner(TEST_CHECKPOINT_DIR);

    const result = await runner.run({
      pipelineId: "test-basic",
      steps: [
        {
          name: "fetch",
          output_event_type: "raw_content",
          run: async (_data) => ({ raw_content: "hello world" })
        },
        {
          name: "transform",
          output_event_type: "processed",
          run: async (data) => ({ processed: String(data["raw_content"]).toUpperCase() })
        },
        {
          name: "finalize",
          output_event_type: "result",
          run: async (data) => ({ result: `done: ${String(data["processed"])}` })
        }
      ]
    });

    expect(result.status).toBe("completed");
    expect(result.steps_run).toBe(3);
    expect(result.steps_total).toBe(3);
    expect(result.final_data["result"]).toBe("done: HELLO WORLD");
    expect(result.failed_step).toBeNull();
    expect(result.error).toBeNull();
    expect(result.resumed_from_step).toBeNull();
  });

  it("writes a checkpoint file for each completed step", async () => {
    const checkpointDir = freshDir("test-checkpoints");
    const runner = new WorkflowRunner(checkpointDir);

    await runner.run({
      pipelineId: "test-checkpoints",
      steps: [
        {
          name: "step-one",
          output_event_type: "one_done",
          run: async (_data) => ({ one: true })
        },
        {
          name: "step-two",
          output_event_type: "two_done",
          run: async (_data) => ({ two: true })
        }
      ]
    });

    const checkpoints = runner.loadCheckpoints("test-checkpoints", checkpointDir);
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0]?.step_name).toBe("step-one");
    expect(checkpoints[0]?.step_index).toBe(0);
    expect(checkpoints[0]?.output_event_type).toBe("one_done");
    expect(checkpoints[0]?.output_payload).toEqual({ one: true });
    expect(checkpoints[1]?.step_name).toBe("step-two");
    expect(typeof checkpoints[0]?.completed_at).toBe("string");
    expect(typeof checkpoints[0]?.wall_time_ms).toBe("number");
  });

  it("halts and returns failed status when a step throws", async () => {
    const runner = new WorkflowRunner(TEST_CHECKPOINT_DIR);

    const result = await runner.run({
      pipelineId: "test-failure",
      steps: [
        {
          name: "step-ok",
          output_event_type: "ok_done",
          run: async (_data) => ({ value: 1 })
        },
        {
          name: "step-boom",
          output_event_type: "never",
          run: async (_data) => {
            throw new Error("intentional failure");
          }
        },
        {
          name: "step-after",
          output_event_type: "after_done",
          run: async (_data) => ({ after: true })
        }
      ]
    });

    expect(result.status).toBe("failed");
    expect(result.failed_step).toBe("step-boom");
    expect(result.error).toContain("intentional failure");
    expect(result.steps_run).toBe(2); // step-ok ran, step-boom failed
    expect(result.step_results[0]?.status).toBe("ok");
    expect(result.step_results[1]?.status).toBe("failed");
  });

  it("resumes from the last checkpoint when called again with the same pipelineId", async () => {
    const checkpointDir = freshDir("test-resume");
    const runner = new WorkflowRunner(checkpointDir);

    const runLog: string[] = [];

    const definition = {
      pipelineId: "test-resume",
      steps: [
        {
          name: "step-a",
          output_event_type: "a_done",
          run: async (_data: Record<string, unknown>) => {
            runLog.push("step-a");
            return { a: "completed" };
          }
        },
        {
          name: "step-b",
          output_event_type: "b_done",
          run: async (_data: Record<string, unknown>) => {
            runLog.push("step-b");
            return { b: "completed" };
          }
        }
      ]
    };

    // First run: complete both steps
    const first = await runner.run(definition);
    expect(first.status).toBe("completed");
    expect(runLog).toEqual(["step-a", "step-b"]);

    // Second run: checkpoints exist, no steps should re-run
    runLog.length = 0;
    const second = await runner.run(definition);
    expect(second.status).toBe("completed");
    expect(runLog).toHaveLength(0); // no steps re-ran
    expect(second.resumed_from_step).toBe(2); // resumed after step index 1 (0-based: 0,1 = 2 checkpoints)
    expect(second.final_data["a"]).toBe("completed");
    expect(second.final_data["b"]).toBe("completed");
  });

  it("rejects a step that returns a non-object output with WorkflowShapeError", async () => {
    const runner = new WorkflowRunner(TEST_CHECKPOINT_DIR);

    const result = await runner.run({
      pipelineId: "test-shape",
      steps: [
        {
          name: "bad-step",
          output_event_type: "bad_output",
          run: async (_data) => {
            // Deliberately return a non-object to trigger shape validation
            return "not an object" as unknown as Record<string, unknown>;
          }
        }
      ]
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("shape validation");
    expect(result.failed_step).toBe("bad-step");
  });

  it("carries data forward between steps through handoff accumulation", async () => {
    const runner = new WorkflowRunner(TEST_CHECKPOINT_DIR);

    const result = await runner.run({
      pipelineId: "test-handoff",
      steps: [
        {
          name: "write-x",
          output_event_type: "x_written",
          run: async (_data) => ({ x: 10 })
        },
        {
          name: "write-y",
          output_event_type: "y_written",
          run: async (data) => ({ y: (data["x"] as number) * 2 })
        },
        {
          name: "sum",
          output_event_type: "sum_written",
          run: async (data) => ({
            sum: (data["x"] as number) + (data["y"] as number)
          })
        }
      ]
    });

    expect(result.status).toBe("completed");
    expect(result.final_data["x"]).toBe(10);
    expect(result.final_data["y"]).toBe(20);
    expect(result.final_data["sum"]).toBe(30);
  });
});

describe("WorkflowShapeError", () => {
  it("is a named error class", () => {
    const err = new WorkflowShapeError("my-step", "non-null object", null);
    expect(err.name).toBe("WorkflowShapeError");
    expect(err.stepName).toBe("my-step");
    expect(err.message).toContain("my-step");
  });
});
