import type { WorkflowDefinition, WorkflowStepDefinition } from "../../workflow-runner/src/index.js";

/**
 * Build-time validation for WorkflowDefinition objects.
 *
 * Implements the Haystack "socket validation" insight (research/2026-05-28-haystack.md):
 * most wiring errors are detectable at assembly time, not at execution time.
 * A workflow that fails validation should never reach WorkflowRunner.run().
 *
 * Validates:
 * - Non-empty steps array
 * - Valid pipelineId (no path separators — checkpoint dir safety)
 * - Non-empty step names
 * - Unique step names within the pipeline
 * - Non-empty output_event_types
 * - Unique output_event_types within the pipeline (Haystack socket discipline)
 * - No step name == pipelineId (prevents checkpoint dir collision)
 */

export interface ValidationIssue {
  readonly kind: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly step_name?: string | undefined;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly pipeline_id: string;
  readonly step_count: number;
  readonly issues: readonly ValidationIssue[];
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
}

// pipelineId used as a directory segment — reject path separators and empty
const SAFE_ID_RE = /^[A-Za-z0-9_\-][A-Za-z0-9_\-\.]*$/;

export class WorkflowValidator {
  validate(definition: WorkflowDefinition): ValidationResult {
    const issues: ValidationIssue[] = [];

    // --- pipelineId checks ---
    if (!definition.pipelineId || definition.pipelineId.trim().length === 0) {
      issues.push({
        kind: "error",
        code: "EMPTY_PIPELINE_ID",
        message: "pipelineId must be a non-empty string."
      });
    } else if (!SAFE_ID_RE.test(definition.pipelineId)) {
      issues.push({
        kind: "error",
        code: "UNSAFE_PIPELINE_ID",
        message: `pipelineId "${definition.pipelineId}" contains path separators or unsafe characters. Use alphanumeric, hyphen, underscore, or dot.`
      });
    }

    // --- steps array checks ---
    if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
      issues.push({
        kind: "error",
        code: "EMPTY_STEPS",
        message: "WorkflowDefinition.steps must be a non-empty array."
      });
      // Cannot do per-step checks without steps
      return buildResult(definition.pipelineId, 0, issues);
    }

    const steps = definition.steps as readonly WorkflowStepDefinition[];
    const seenStepNames = new Map<string, number>();
    const seenEventTypes = new Map<string, number>();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;
      const stepLabel = step.name || `steps[${i}]`;

      // Empty step name
      if (!step.name || step.name.trim().length === 0) {
        issues.push({
          kind: "error",
          code: "EMPTY_STEP_NAME",
          message: `Step at index ${i} has an empty name.`,
          step_name: stepLabel
        });
      }

      // Duplicate step name
      const priorNameIndex = seenStepNames.get(step.name);
      if (priorNameIndex !== undefined) {
        issues.push({
          kind: "error",
          code: "DUPLICATE_STEP_NAME",
          message: `Step name "${step.name}" appears at both index ${priorNameIndex} and index ${i}. Step names must be unique within a pipeline.`,
          step_name: step.name
        });
      } else {
        seenStepNames.set(step.name, i);
      }

      // Step name == pipelineId would cause checkpoint dir collision
      if (step.name === definition.pipelineId) {
        issues.push({
          kind: "warning",
          code: "STEP_NAME_MATCHES_PIPELINE_ID",
          message: `Step name "${step.name}" matches pipelineId. This may cause checkpoint directory conflicts.`,
          step_name: step.name
        });
      }

      // Empty output_event_type
      if (!step.output_event_type || step.output_event_type.trim().length === 0) {
        issues.push({
          kind: "error",
          code: "EMPTY_OUTPUT_EVENT_TYPE",
          message: `Step "${stepLabel}" has an empty output_event_type. Every step must declare the event it produces (Haystack socket discipline).`,
          step_name: stepLabel
        });
      } else {
        // Duplicate output_event_type — Haystack: socket names must be unique to enable unambiguous wiring
        const priorEventIndex = seenEventTypes.get(step.output_event_type);
        if (priorEventIndex !== undefined) {
          issues.push({
            kind: "error",
            code: "DUPLICATE_OUTPUT_EVENT_TYPE",
            message: `output_event_type "${step.output_event_type}" is declared by both step[${priorEventIndex}] and step[${i}] ("${step.name}"). Event types must be unique so downstream steps can unambiguously consume outputs.`,
            step_name: step.name
          });
        } else {
          seenEventTypes.set(step.output_event_type, i);
        }
      }

      // run must be a function
      if (typeof step.run !== "function") {
        issues.push({
          kind: "error",
          code: "STEP_RUN_NOT_FUNCTION",
          message: `Step "${stepLabel}".run must be a function.`,
          step_name: stepLabel
        });
      }
    }

    return buildResult(definition.pipelineId, steps.length, issues);
  }

  /**
   * Throws a WorkflowValidationError if the definition is invalid.
   * Convenience wrapper for callers that treat validation failures as exceptions.
   */
  assertValid(definition: WorkflowDefinition): void {
    const result = this.validate(definition);
    if (!result.valid) {
      throw new WorkflowValidationError(result);
    }
  }
}

export class WorkflowValidationError extends Error {
  readonly result: ValidationResult;

  constructor(result: ValidationResult) {
    const summary = result.errors
      .map((e) => `[${e.code}] ${e.message}`)
      .join("; ");
    super(`WorkflowDefinition "${result.pipeline_id}" failed validation: ${summary}`);
    this.name = "WorkflowValidationError";
    this.result = result;
  }
}

function buildResult(
  pipeline_id: string,
  step_count: number,
  issues: ValidationIssue[]
): ValidationResult {
  const errors = issues.filter((i) => i.kind === "error");
  const warnings = issues.filter((i) => i.kind === "warning");
  return {
    valid: errors.length === 0,
    pipeline_id,
    step_count,
    issues,
    errors,
    warnings
  };
}
