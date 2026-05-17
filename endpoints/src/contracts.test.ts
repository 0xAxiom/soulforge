import { describe, expect, it } from "vitest";
import {
  EndpointManifestContractSchema,
  EndpointRouteContractSchema,
  assertRouteInvocation,
  createTraceContext
} from "./index.js";

const inspectRoute = {
  path: "/api/inspect",
  method: "POST",
  auth: "x402",
  description: "Inspect a URL after payment.",
  input_schema: { type: "object", properties: { url: { type: "string" } } },
  output_schema: { type: "object", properties: { title: { type: ["string", "null"] } } },
  side_effects: ["fetches upstream URL"],
  emits_observability: ["latency", "error", "receipt"],
  replay: {
    deterministic: false,
    receipt_required: true,
    notes: "Replay uses captured response fixtures and payment receipt metadata."
  },
  payment: {
    price_usd: "$0.01",
    network: "base",
    pay_to_env: "PAY_TO_ADDRESS"
  }
} as const;

describe("endpoint contracts", () => {
  it("validates endpoint manifests for AI-readable discovery", () => {
    const manifest = EndpointManifestContractSchema.parse({
      name: "url-inspector",
      version: "0.1.0",
      description: "Paid URL metadata inspector.",
      routes: [inspectRoute],
      publisher: { name: "SoulForge" }
    });

    expect(manifest.routes[0]?.auth).toBe("x402");
  });

  it("rejects x402 routes without receipt observability", () => {
    expect(() =>
      EndpointRouteContractSchema.parse({
        ...inspectRoute,
        emits_observability: ["latency", "error"]
      })
    ).toThrow(/receipt observability/);
  });

  it("requires a payment receipt when invoking paid routes", () => {
    const route = EndpointRouteContractSchema.parse(inspectRoute);
    const invocation = {
      route: "/api/inspect",
      input: { url: "https://example.com" },
      trace: createTraceContext({ trace_id: "trace-1" })
    };

    expect(() => {
      assertRouteInvocation(route, invocation);
    }).toThrow(/requires an x402 payment receipt/);
  });
});
