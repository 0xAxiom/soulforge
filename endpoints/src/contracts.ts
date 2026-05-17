import { z } from "zod";

export const EndpointMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export const EndpointAuthSchema = z.enum(["free", "x402", "api-key", "webhook"]);
export const EndpointNetworkSchema = z.enum(["base", "base-sepolia"]);

export const JsonSchemaObjectSchema = z.looseObject({
  type: z.string()
});

export const EndpointRouteContractSchema = z
  .object({
    path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/),
    method: EndpointMethodSchema,
    auth: EndpointAuthSchema,
    description: z.string().min(1),
    input_schema: JsonSchemaObjectSchema,
    output_schema: JsonSchemaObjectSchema,
    side_effects: z.array(z.string()).default([]),
    emits_observability: z.array(z.enum(["cost", "latency", "error", "tool_call", "receipt"])).default([
      "latency",
      "error"
    ]),
    replay: z.object({
      deterministic: z.boolean(),
      receipt_required: z.boolean(),
      notes: z.string().min(1)
    }),
    payment: z
      .object({
        price_usd: z.string().regex(/^\$?[0-9]+(\.[0-9]{1,6})?$/),
        network: EndpointNetworkSchema,
        pay_to_env: z.string().min(1).default("PAY_TO_ADDRESS")
      })
      .optional()
  })
  .superRefine((route, ctx) => {
    if (route.auth === "x402" && route.payment === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["payment"],
        message: "x402 endpoints require payment contract metadata"
      });
    }
    if (route.auth !== "x402" && route.payment !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["payment"],
        message: "payment metadata is only valid for x402 endpoints"
      });
    }
    if (route.auth === "x402" && !route.emits_observability.includes("receipt")) {
      ctx.addIssue({
        code: "custom",
        path: ["emits_observability"],
        message: "x402 endpoints must emit receipt observability"
      });
    }
  });

export const EndpointManifestContractSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/),
  description: z.string().min(1),
  routes: z.array(EndpointRouteContractSchema).min(1),
  publisher: z.object({
    name: z.string().min(1),
    url: z.url().optional()
  })
});

export const EndpointTraceContextSchema = z.object({
  trace_id: z.string().min(1),
  session_id: z.string().min(1).optional(),
  turn_id: z.string().min(1).optional(),
  parent_turn_id: z.string().min(1).optional()
});

export const EndpointPaymentReceiptSchema = z.object({
  provider: z.literal("x402"),
  network: EndpointNetworkSchema,
  amount_usd: z.string().regex(/^\$?[0-9]+(\.[0-9]{1,6})?$/),
  payer: z.string().min(1).optional(),
  pay_to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  receipt_id: z.string().min(1),
  settled_at: z.iso.datetime().optional()
});

export const EndpointInvocationSchema = z.object({
  route: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/),
  input: z.unknown(),
  trace: EndpointTraceContextSchema,
  payment_receipt: EndpointPaymentReceiptSchema.optional()
});

export type EndpointRouteContract = z.infer<typeof EndpointRouteContractSchema>;
export type EndpointManifestContract = z.infer<typeof EndpointManifestContractSchema>;
export type EndpointTraceContext = z.infer<typeof EndpointTraceContextSchema>;
export type EndpointPaymentReceipt = z.infer<typeof EndpointPaymentReceiptSchema>;
export type EndpointInvocation = z.infer<typeof EndpointInvocationSchema>;

export function createTraceContext(input: Partial<EndpointTraceContext> = {}): EndpointTraceContext {
  return EndpointTraceContextSchema.parse({
    trace_id: input.trace_id ?? crypto.randomUUID(),
    session_id: input.session_id,
    turn_id: input.turn_id,
    parent_turn_id: input.parent_turn_id
  });
}

export function assertRouteInvocation(route: EndpointRouteContract, invocation: EndpointInvocation): void {
  if (route.path !== invocation.route) {
    throw new Error(`Invocation route ${invocation.route} does not match contract route ${route.path}`);
  }
  if (route.auth === "x402" && invocation.payment_receipt === undefined) {
    throw new Error(`Invocation for paid route ${route.path} requires an x402 payment receipt`);
  }
}
