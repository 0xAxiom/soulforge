import { z } from "zod";
import type { ObservabilitySink } from "../../../observability/src/index.js";
import { ErrorRecorder, LatencyRecorder, MemoryObservabilitySink, nowIso } from "../../../observability/src/index.js";

const BankrNetworkSchema = z.enum(["base", "base-sepolia"]);

export const BankrPriceInputSchema = z.object({
  token: z.string().min(1),
  network: BankrNetworkSchema.default("base"),
  dryRun: z.boolean().default(true),
  traceId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional()
});

export const BankrPortfolioInputSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  network: BankrNetworkSchema.default("base"),
  dryRun: z.boolean().default(true),
  traceId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional()
});

export const BankrSwapInputSchema = z.object({
  fromToken: z.string().min(1),
  toToken: z.string().min(1),
  amountUsd: z.number().positive(),
  spendingCapUsd: z.number().positive().optional(),
  network: BankrNetworkSchema.default("base-sepolia"),
  dryRun: z.boolean().default(true),
  live: z.boolean().default(false),
  idempotencyKey: z.string().min(8).optional(),
  traceId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional()
});

export const BankrFeeRecipientSchema = z.object({
  type: z.enum(["wallet", "x", "farcaster", "ens"]),
  value: z.string().min(1)
});

export const BankrDeployTokenInputSchema = z.object({
  name: z.string().min(1).max(64),
  symbol: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Z0-9]+$/, "symbol must be uppercase letters and digits"),
  feeRecipient: BankrFeeRecipientSchema,
  description: z.string().max(500).optional(),
  imageUri: z.url().optional(),
  website: z.url().optional(),
  twitter: z.string().min(1).max(64).optional(),
  telegram: z.string().min(1).max(64).optional(),
  network: z.literal("base").default("base"),
  dryRun: z.boolean().default(true),
  live: z.boolean().default(false),
  idempotencyKey: z.string().min(8).optional(),
  traceId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional()
});

export const BankrReceiptSchema = z.object({
  provider: z.literal("bankr"),
  action: z.enum(["price", "portfolio", "swap", "deployToken"]),
  status: z.enum(["simulated", "submitted"]),
  network: BankrNetworkSchema,
  prompt: z.string(),
  jobId: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  dryRun: z.boolean(),
  live: z.boolean(),
  createdAt: z.string(),
  tokenAddress: z.string().nullable().optional(),
  txHash: z.string().nullable().optional(),
  raw: z.unknown().optional()
});

export type BankrPriceInput = z.input<typeof BankrPriceInputSchema>;
export type BankrPortfolioInput = z.input<typeof BankrPortfolioInputSchema>;
export type BankrSwapInput = z.input<typeof BankrSwapInputSchema>;
export type BankrDeployTokenInput = z.input<typeof BankrDeployTokenInputSchema>;
export type BankrFeeRecipient = z.infer<typeof BankrFeeRecipientSchema>;
export type BankrReceipt = z.infer<typeof BankrReceiptSchema>;

export interface BankrHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface BankrTransport {
  request(path: string, init: { readonly method: string; readonly headers: Record<string, string>; readonly body?: string }): Promise<BankrHttpResponse>;
}

export interface BankrClientOptions {
  readonly apiKey?: string | undefined;
  readonly apiUrl?: string | undefined;
  readonly transport?: BankrTransport | undefined;
  readonly observability?: ObservabilitySink | undefined;
}

export class BankrClient {
  private readonly apiKey: string | undefined;
  private readonly apiUrl: string;
  private readonly transport: BankrTransport;
  private readonly latency: LatencyRecorder;
  private readonly errors: ErrorRecorder;

  constructor(options: BankrClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.BANKR_API_KEY;
    this.apiUrl = options.apiUrl ?? process.env.BANKR_API_URL ?? "https://api.bankr.bot";
    this.transport = options.transport ?? new FetchBankrTransport(this.apiUrl);
    const sink = options.observability ?? new MemoryObservabilitySink();
    this.latency = new LatencyRecorder(sink);
    this.errors = new ErrorRecorder(sink);
  }

  async price(input: BankrPriceInput): Promise<BankrReceipt> {
    const parsed = BankrPriceInputSchema.parse(input);
    const prompt = `Return the current ${parsed.token} price on ${parsed.network}.`;
    return this.submitOrSimulate({
      action: "price",
      prompt,
      network: parsed.network,
      dryRun: parsed.dryRun,
      live: !parsed.dryRun,
      traceId: parsed.traceId,
      sessionId: parsed.sessionId,
      idempotencyKey: null
    });
  }

  async portfolio(input: BankrPortfolioInput): Promise<BankrReceipt> {
    const parsed = BankrPortfolioInputSchema.parse(input);
    const prompt = `Return portfolio balances for ${parsed.walletAddress} on ${parsed.network}.`;
    return this.submitOrSimulate({
      action: "portfolio",
      prompt,
      network: parsed.network,
      dryRun: parsed.dryRun,
      live: !parsed.dryRun,
      traceId: parsed.traceId,
      sessionId: parsed.sessionId,
      idempotencyKey: null
    });
  }

  async deployToken(input: BankrDeployTokenInput): Promise<BankrReceipt> {
    const parsed = BankrDeployTokenInputSchema.parse(input);
    if (!parsed.dryRun || parsed.live) {
      assertLiveDeployGuardrails(parsed);
    }
    const recipientPhrase =
      parsed.feeRecipient.type === "wallet"
        ? parsed.feeRecipient.value
        : `${parsed.feeRecipient.type}:${parsed.feeRecipient.value}`;
    const prompt = `${
      parsed.dryRun ? "Simulate" : "Execute"
    } deploy of token "${parsed.name}" ($${parsed.symbol}) on ${parsed.network} attributed to ${recipientPhrase}.`;
    const traceId = parsed.traceId ?? crypto.randomUUID();
    const started = performance.now();

    if (parsed.dryRun) {
      const receipt = BankrReceiptSchema.parse({
        provider: "bankr",
        action: "deployToken",
        status: "simulated",
        network: parsed.network,
        prompt,
        jobId: null,
        idempotencyKey: parsed.idempotencyKey ?? null,
        dryRun: true,
        live: false,
        createdAt: nowIso(),
        tokenAddress: null,
        txHash: null
      });
      this.latency.record({
        trace_id: traceId,
        session_id: parsed.sessionId,
        name: "bankr.deployToken",
        tool: "bankr",
        duration_ms: Math.round(performance.now() - started)
      });
      return receipt;
    }

    try {
      const raw = await this.submitDeploy({
        name: parsed.name,
        symbol: parsed.symbol,
        feeRecipient: parsed.feeRecipient,
        description: parsed.description,
        image: parsed.imageUri,
        website: parsed.website,
        twitter: parsed.twitter,
        telegram: parsed.telegram,
        simulateOnly: false
      });
      const tokenAddress = readTokenAddress(raw);
      const txHash = readTxHash(raw);
      const jobId = readJobId(raw);
      const receipt = BankrReceiptSchema.parse({
        provider: "bankr",
        action: "deployToken",
        status: "submitted",
        network: parsed.network,
        prompt,
        jobId,
        idempotencyKey: parsed.idempotencyKey ?? null,
        dryRun: false,
        live: parsed.live,
        createdAt: nowIso(),
        tokenAddress,
        txHash,
        raw
      });
      this.latency.record({
        trace_id: traceId,
        session_id: parsed.sessionId,
        name: "bankr.deployToken",
        tool: "bankr",
        duration_ms: Math.round(performance.now() - started)
      });
      return receipt;
    } catch (error) {
      this.errors.record({
        trace_id: traceId,
        session_id: parsed.sessionId,
        name: "bankr.deployToken",
        tool: "bankr",
        upstream: "bankr",
        error_class: error instanceof Error ? error.constructor.name : "BankrError",
        message: error instanceof Error ? error.message : "Unknown Bankr error"
      });
      throw error;
    }
  }

  async swap(input: BankrSwapInput): Promise<BankrReceipt> {
    const parsed = BankrSwapInputSchema.parse(input);
    if (!parsed.dryRun || parsed.live) {
      assertLiveSwapGuardrails(parsed);
    }
    const prompt = `${parsed.dryRun ? "Simulate" : "Execute"} swapping $${parsed.amountUsd.toString()} of ${parsed.fromToken} to ${parsed.toToken} on ${parsed.network}.`;
    return this.submitOrSimulate({
      action: "swap",
      prompt,
      network: parsed.network,
      dryRun: parsed.dryRun,
      live: parsed.live,
      traceId: parsed.traceId,
      sessionId: parsed.sessionId,
      idempotencyKey: parsed.idempotencyKey ?? null
    });
  }

  private async submitOrSimulate(input: {
    readonly action: "price" | "portfolio" | "swap";
    readonly prompt: string;
    readonly network: z.infer<typeof BankrNetworkSchema>;
    readonly dryRun: boolean;
    readonly live: boolean;
    readonly traceId?: string | undefined;
    readonly sessionId?: string | undefined;
    readonly idempotencyKey: string | null;
  }): Promise<BankrReceipt> {
    const traceId = input.traceId ?? crypto.randomUUID();
    const started = performance.now();
    if (input.dryRun) {
      const receipt = BankrReceiptSchema.parse({
        provider: "bankr",
        action: input.action,
        status: "simulated",
        network: input.network,
        prompt: input.prompt,
        jobId: null,
        idempotencyKey: input.idempotencyKey,
        dryRun: true,
        live: false,
        createdAt: nowIso()
      });
      this.latency.record({
        trace_id: traceId,
        session_id: input.sessionId,
        name: `bankr.${input.action}`,
        tool: "bankr",
        duration_ms: Math.round(performance.now() - started)
      });
      return receipt;
    }

    try {
      const raw = await this.submitPrompt(input.prompt);
      const jobId = readJobId(raw);
      const receipt = BankrReceiptSchema.parse({
        provider: "bankr",
        action: input.action,
        status: "submitted",
        network: input.network,
        prompt: input.prompt,
        jobId,
        idempotencyKey: input.idempotencyKey,
        dryRun: false,
        live: input.live,
        createdAt: nowIso(),
        raw
      });
      this.latency.record({
        trace_id: traceId,
        session_id: input.sessionId,
        name: `bankr.${input.action}`,
        tool: "bankr",
        duration_ms: Math.round(performance.now() - started)
      });
      return receipt;
    } catch (error) {
      this.errors.record({
        trace_id: traceId,
        session_id: input.sessionId,
        name: `bankr.${input.action}`,
        tool: "bankr",
        upstream: "bankr",
        error_class: error instanceof Error ? error.constructor.name : "BankrError",
        message: error instanceof Error ? error.message : "Unknown Bankr error"
      });
      throw error;
    }
  }

  private async submitDeploy(body: {
    readonly name: string;
    readonly symbol: string;
    readonly feeRecipient: BankrFeeRecipient;
    readonly description?: string | undefined;
    readonly image?: string | undefined;
    readonly website?: string | undefined;
    readonly twitter?: string | undefined;
    readonly telegram?: string | undefined;
    readonly simulateOnly: boolean;
  }): Promise<unknown> {
    if (this.apiKey === undefined || this.apiKey.trim().length === 0) {
      throw new BankrAuthError("BANKR_API_KEY is required for live Bankr token deploys");
    }
    const response = await this.transport.request("/token-launches/deploy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401) {
        throw new BankrAuthError("Bankr API key is invalid, inactive, or missing token-launches access");
      }
      if (response.status === 429) {
        throw new BankrRateLimitError(text.length > 0 ? text : "Bankr API rate limit exceeded");
      }
      throw new BankrUpstreamError(`Bankr deploy request failed: ${String(response.status)} ${text}`);
    }
    return response.json();
  }

  private async submitPrompt(prompt: string): Promise<unknown> {
    if (this.apiKey === undefined || this.apiKey.trim().length === 0) {
      throw new BankrAuthError("BANKR_API_KEY is required for live Bankr requests");
    }
    const response = await this.transport.request("/agent/prompt", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey
      },
      body: JSON.stringify({ prompt })
    });
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401) {
        throw new BankrAuthError("Bankr API key is invalid, inactive, or missing Agent API access");
      }
      if (response.status === 429) {
        throw new BankrRateLimitError(text.length > 0 ? text : "Bankr API rate limit exceeded");
      }
      throw new BankrUpstreamError(`Bankr API request failed: ${String(response.status)} ${text}`);
    }
    return response.json();
  }
}

export class BankrAuthError extends Error {}
export class BankrRateLimitError extends Error {}
export class BankrUpstreamError extends Error {}
export class BankrSafetyError extends Error {}

class FetchBankrTransport implements BankrTransport {
  constructor(private readonly apiUrl: string) {}

  async request(path: string, init: { readonly method: string; readonly headers: Record<string, string>; readonly body?: string }): Promise<BankrHttpResponse> {
    return fetch(`${this.apiUrl}${path}`, init);
  }
}

function assertLiveSwapGuardrails(input: z.infer<typeof BankrSwapInputSchema>): void {
  if (!input.live || input.dryRun) {
    throw new BankrSafetyError("Live swaps require live=true and dryRun=false");
  }
  if (input.spendingCapUsd === undefined || input.spendingCapUsd < input.amountUsd) {
    throw new BankrSafetyError("Live swaps require spendingCapUsd greater than or equal to amountUsd");
  }
  if (input.idempotencyKey === undefined || input.idempotencyKey.trim().length < 8) {
    throw new BankrSafetyError("Live swaps require an idempotencyKey");
  }
}

function readJobId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || !("jobId" in raw)) {
    return null;
  }
  const value = raw.jobId;
  return typeof value === "string" ? value : null;
}

function readTokenAddress(raw: unknown): string | null {
  return readStringField(raw, ["tokenAddress", "contractAddress", "address"]);
}

function readTxHash(raw: unknown): string | null {
  return readStringField(raw, ["txHash", "transactionHash", "hash"]);
}

function readStringField(raw: unknown, keys: readonly string[]): string | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function assertLiveDeployGuardrails(input: z.infer<typeof BankrDeployTokenInputSchema>): void {
  if (!input.live || input.dryRun) {
    throw new BankrSafetyError("Live deploys require live=true and dryRun=false");
  }
  if (input.idempotencyKey === undefined || input.idempotencyKey.trim().length < 8) {
    throw new BankrSafetyError("Live deploys require an idempotencyKey of at least 8 characters");
  }
}
