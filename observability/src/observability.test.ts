import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { CostLedger, ErrorRecorder, JsonlObservabilitySink, LatencyHistogram, LatencyRecorder, groupErrors } from "./index.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("observability primitives", () => {
  it("writes JSONL cost and latency events", () => {
    const path = makePath();
    const sink = new JsonlObservabilitySink(path);
    new CostLedger(sink).record({
      trace_id: "trace-1",
      session_id: "session-1",
      name: "x402.payment",
      cost_usd: 0.01,
      usdc_amount: "0.01"
    });
    new LatencyRecorder(sink).record({
      trace_id: "trace-1",
      name: "agent.turn",
      duration_ms: 42
    });

    const raw = readFileSync(path, "utf8");
    expect(raw).toContain("\"kind\":\"cost\"");
    expect(sink.read()).toHaveLength(2);
    expect(CostLedger.summarize(sink.read()).total_cost_usd).toBe(0.01);
  });

  it("computes latency percentiles from events", () => {
    const path = makePath();
    const sink = new JsonlObservabilitySink(path);
    const recorder = new LatencyRecorder(sink);
    recorder.record({ trace_id: "trace-1", name: "endpoint", duration_ms: 10 });
    recorder.record({ trace_id: "trace-2", name: "endpoint", duration_ms: 20 });
    recorder.record({ trace_id: "trace-3", name: "endpoint", duration_ms: 100 });

    const histogram = LatencyHistogram.fromEvents(sink.read(), "endpoint");
    expect(histogram.percentile(50)).toBe(20);
    expect(histogram.percentile(95)).toBe(100);
  });

  it("groups errors by tool, soul version, upstream, and class", () => {
    const path = makePath();
    const sink = new JsonlObservabilitySink(path);
    const recorder = new ErrorRecorder(sink);
    recorder.record({
      trace_id: "trace-1",
      name: "bankr.swap",
      tool: "bankr",
      soul_version: "trader@0.1.0",
      upstream: "bankr",
      error_class: "BankrRateLimitError",
      message: "rate limited"
    });
    recorder.record({
      trace_id: "trace-2",
      name: "bankr.swap",
      tool: "bankr",
      soul_version: "trader@0.1.0",
      upstream: "bankr",
      error_class: "BankrRateLimitError",
      message: "rate limited"
    });

    expect(groupErrors(sink.read())[0]).toMatchObject({
      count: 2,
      error_class: "BankrRateLimitError",
      tool: "bankr"
    });
  });
});

function makePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "soulforge-obs-"));
  tempDirs.push(dir);
  return join(dir, "events.jsonl");
}
