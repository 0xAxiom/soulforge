import { describe, expect, it } from "vitest";
import { WorkflowValidationError, WorkflowValidator } from "./index.js";

const validator = new WorkflowValidator();

const validStep = (name: string, eventType: string) => ({
  name,
  output_event_type: eventType,
  run: async (_data: Record<string, unknown>) => ({})
});

describe("WorkflowValidator", () => {
  it("accepts a well-formed workflow", () => {
    const result = validator.validate({
      pipelineId: "my-pipeline",
      steps: [
        validStep("fetch", "raw_content"),
        validStep("transform", "processed"),
        validStep("publish", "published")
      ]
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.step_count).toBe(3);
  });

  it("rejects empty pipelineId", () => {
    const result = validator.validate({ pipelineId: "", steps: [validStep("fetch", "raw")] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EMPTY_PIPELINE_ID")).toBe(true);
  });

  it("rejects pipelineId with path separators", () => {
    const result = validator.validate({
      pipelineId: "my/pipeline",
      steps: [validStep("fetch", "raw")]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "UNSAFE_PIPELINE_ID")).toBe(true);
  });

  it("rejects empty steps array", () => {
    const result = validator.validate({ pipelineId: "p", steps: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EMPTY_STEPS")).toBe(true);
  });

  it("rejects duplicate step names", () => {
    const result = validator.validate({
      pipelineId: "p",
      steps: [validStep("fetch", "raw"), validStep("fetch", "processed")]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_STEP_NAME")).toBe(true);
  });

  it("rejects duplicate output_event_types", () => {
    const result = validator.validate({
      pipelineId: "p",
      steps: [validStep("step-a", "done"), validStep("step-b", "done")]
    });
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === "DUPLICATE_OUTPUT_EVENT_TYPE");
    expect(err).toBeDefined();
    expect(err?.message).toContain('"done"');
  });

  it("rejects step with empty output_event_type", () => {
    const result = validator.validate({
      pipelineId: "p",
      steps: [{ name: "fetch", output_event_type: "", run: async () => ({}) }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EMPTY_OUTPUT_EVENT_TYPE")).toBe(true);
  });

  it("rejects step where run is not a function", () => {
    const result = validator.validate({
      pipelineId: "p",
      steps: [{ name: "fetch", output_event_type: "raw", run: "not-a-function" as unknown as () => Promise<Record<string, unknown>> }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "STEP_RUN_NOT_FUNCTION")).toBe(true);
  });

  it("emits warning when step name matches pipelineId", () => {
    const result = validator.validate({
      pipelineId: "fetch",
      steps: [validStep("fetch", "raw")]
    });
    // still valid (warning only)
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === "STEP_NAME_MATCHES_PIPELINE_ID")).toBe(true);
  });

  it("assertValid throws WorkflowValidationError on invalid definition", () => {
    expect(() =>
      validator.assertValid({ pipelineId: "", steps: [] })
    ).toThrow(WorkflowValidationError);
  });

  it("assertValid passes silently on valid definition", () => {
    expect(() =>
      validator.assertValid({
        pipelineId: "ok-pipeline",
        steps: [validStep("step-one", "result")]
      })
    ).not.toThrow();
  });

  it("accumulates multiple errors in one pass", () => {
    const result = validator.validate({
      pipelineId: "bad/id",
      steps: [
        validStep("a", "ev1"),
        validStep("a", "ev1") // both name and event type are duplicates
      ]
    });
    expect(result.valid).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("UNSAFE_PIPELINE_ID");
    expect(codes).toContain("DUPLICATE_STEP_NAME");
    expect(codes).toContain("DUPLICATE_OUTPUT_EVENT_TYPE");
  });
});
