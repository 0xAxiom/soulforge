import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/**
 * A step checkpoint — the minimal record needed to resume a pipeline from any
 * completed step without re-running prior steps. Schema matches the contract in
 * souls/examples/deterministic-workflow-soul.md, informed by LlamaIndex
 * WorkflowCheckpointer (step_name, output_event_type, output_payload,
 * completed_at) and extended with pipeline_id, step_index, and wall_time_ms
 * for ordering and replay.
 */
export interface StepCheckpoint {
  readonly pipeline_id: string;
  readonly step_name: string;
  readonly step_index: number;
  readonly output_event_type: string;
  readonly output_payload: Record<string, unknown>;
  readonly completed_at: string;
  readonly wall_time_ms: number;
}

/**
 * A single step in a workflow. Receives the accumulated handoff data and
 * returns an object whose keys are merged into the handoff for downstream
 * steps. output_event_type names the logical event this step produces —
 * borrowing Haystack's socket-naming discipline so orchestrators can validate
 * wiring before execution.
 */
export interface WorkflowStepDefinition {
  readonly name: string;
  readonly output_event_type: string;
  readonly run: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface WorkflowDefinition {
  readonly pipelineId: string;
  readonly steps: readonly WorkflowStepDefinition[];
}

export interface WorkflowRunOptions {
  readonly checkpointDir?: string | undefined;
  readonly traceId?: string | undefined;
}

export interface StepResult {
  readonly step_name: string;
  readonly step_index: number;
  readonly status: "ok" | "failed";
  readonly error?: string | undefined;
  readonly wall_time_ms: number;
}

export interface WorkflowResult {
  readonly pipeline_id: string;
  readonly status: "completed" | "failed";
  readonly steps_run: number;
  readonly steps_total: number;
  readonly final_data: Record<string, unknown>;
  readonly step_results: readonly StepResult[];
  readonly resumed_from_step: number | null;
  readonly failed_step: string | null;
  readonly error: string | null;
}

export class WorkflowShapeError extends Error {
  constructor(
    readonly stepName: string,
    readonly expected: string,
    readonly received: unknown
  ) {
    super(
      `Step "${stepName}" output failed shape validation: expected ${expected}, got ${JSON.stringify(received)}`
    );
    this.name = "WorkflowShapeError";
  }
}

export class WorkflowStepError extends Error {
  constructor(
    readonly stepName: string,
    readonly stepCause: unknown
  ) {
    super(`Step "${stepName}" threw: ${stepCause instanceof Error ? stepCause.message : String(stepCause)}`);
    this.name = "WorkflowStepError";
  }
}

/**
 * WorkflowRunner — executes a WorkflowDefinition step-by-step, writing a
 * StepCheckpoint to disk after each successful step. If a step fails, the run
 * halts and returns a failed WorkflowResult. Calling run() again with the same
 * pipelineId resumes from the last completed checkpoint, skipping already-
 * completed steps (idempotency gate: pipeline_id).
 */
export class WorkflowRunner {
  private readonly defaultCheckpointDir: string;

  constructor(defaultCheckpointDir: string = ".workflow-checkpoints") {
    this.defaultCheckpointDir = defaultCheckpointDir;
  }

  async run(definition: WorkflowDefinition, options: WorkflowRunOptions = {}): Promise<WorkflowResult> {
    const { pipelineId, steps } = definition;
    const checkpointDir = options.checkpointDir ?? this.defaultCheckpointDir;

    // Resume support: reconstruct handoff data from existing checkpoints.
    const existingCheckpoints = this.loadCheckpoints(pipelineId, checkpointDir);
    const resumeFromIndex = existingCheckpoints.length;

    let data: Record<string, unknown> = {};
    for (const cp of existingCheckpoints) {
      data = { ...data, ...cp.output_payload };
    }

    const stepResults: StepResult[] = [];

    for (let i = resumeFromIndex; i < steps.length; i++) {
      const step = steps[i];
      if (step === undefined) break;

      const started = performance.now();

      try {
        const output = await step.run(data);

        if (typeof output !== "object" || output === null || Array.isArray(output)) {
          throw new WorkflowShapeError(step.name, "plain non-null object", output);
        }

        const wallTimeMs = Math.round(performance.now() - started);
        const completedAt = new Date().toISOString();

        data = { ...data, ...output };

        const checkpoint: StepCheckpoint = {
          pipeline_id: pipelineId,
          step_name: step.name,
          step_index: i,
          output_event_type: step.output_event_type,
          output_payload: output,
          completed_at: completedAt,
          wall_time_ms: wallTimeMs
        };

        this._writeCheckpoint(checkpoint, checkpointDir);

        stepResults.push({
          step_name: step.name,
          step_index: i,
          status: "ok",
          wall_time_ms: wallTimeMs
        });
      } catch (error) {
        const wallTimeMs = Math.round(performance.now() - started);
        const message = error instanceof Error ? error.message : String(error);

        stepResults.push({
          step_name: step.name,
          step_index: i,
          status: "failed",
          error: message,
          wall_time_ms: wallTimeMs
        });

        return {
          pipeline_id: pipelineId,
          status: "failed",
          steps_run: stepResults.length,
          steps_total: steps.length,
          final_data: data,
          step_results: stepResults,
          resumed_from_step: resumeFromIndex > 0 ? resumeFromIndex : null,
          failed_step: step.name,
          error: message
        };
      }
    }

    return {
      pipeline_id: pipelineId,
      status: "completed",
      steps_run: stepResults.length,
      steps_total: steps.length,
      final_data: data,
      step_results: stepResults,
      resumed_from_step: resumeFromIndex > 0 ? resumeFromIndex : null,
      failed_step: null,
      error: null
    };
  }

  /**
   * Load checkpoints for a pipeline from disk, sorted by step_index order.
   * Returns an empty array if the pipeline has no prior run.
   */
  loadCheckpoints(pipelineId: string, checkpointDir?: string | undefined): StepCheckpoint[] {
    const dir = checkpointDir ?? this.defaultCheckpointDir;
    const pipelineDir = join(dir, pipelineId);
    if (!existsSync(pipelineDir)) return [];

    return readdirSync(pipelineDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => {
        const raw = readFileSync(join(pipelineDir, f), "utf8");
        return JSON.parse(raw) as StepCheckpoint;
      });
  }

  /**
   * Clear all checkpoints for a pipeline — use before retrying a completed run
   * from scratch. Does nothing if the pipeline has no prior checkpoints.
   */
  clearCheckpoints(pipelineId: string, checkpointDir?: string | undefined): void {
    const dir = checkpointDir ?? this.defaultCheckpointDir;
    const pipelineDir = join(dir, pipelineId);
    if (!existsSync(pipelineDir)) return;

    for (const f of readdirSync(pipelineDir).filter((f) => f.endsWith(".json"))) {
      unlinkSync(join(pipelineDir, f));
    }
  }

  private _writeCheckpoint(checkpoint: StepCheckpoint, dir: string): void {
    const pipelineDir = join(dir, checkpoint.pipeline_id);
    mkdirSync(pipelineDir, { recursive: true });
    const filename = `${String(checkpoint.step_index).padStart(4, "0")}-${checkpoint.step_name}.json`;
    writeFileSync(join(pipelineDir, filename), JSON.stringify(checkpoint, null, 2));
  }
}
