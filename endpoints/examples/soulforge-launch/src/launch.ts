import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import {
  BankrClient,
  type BankrDeployTokenInput,
  type BankrReceipt
} from "../../../../tools/bankr/src/index.js";
import {
  EndpointPaymentReceiptSchema,
  type EndpointPaymentReceipt
} from "../../../src/contracts.js";

const here = dirname(fileURLToPath(import.meta.url));
const defaultCliPath = resolve(here, "../../../../generator/cli.mjs");

export const SoulForgeLaunchInputSchema = z.object({
  agentName: z
    .string()
    .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, "agentName must be kebab-case"),
  agentDescription: z.string().min(8).max(280),
  twitterHandle: z
    .string()
    .regex(/^@[A-Za-z0-9_]{1,15}$/, "twitterHandle must start with @ and match X username rules"),
  tokenName: z.string().min(1).max(64),
  tokenSymbol: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Z0-9]+$/, "tokenSymbol must be uppercase letters and digits"),
  tokenDescription: z.string().max(500).optional(),
  tokenImageUri: z.url().optional(),
  website: z.url().optional(),
  telegram: z.string().min(1).max(64).optional(),
  outDir: z.string().min(1),
  dryRun: z.boolean().default(true),
  idempotencyKey: z.string().min(8).optional(),
  paymentReceipt: EndpointPaymentReceiptSchema.optional(),
  traceId: z.string().min(1).optional()
});

export type SoulForgeLaunchInput = z.input<typeof SoulForgeLaunchInputSchema>;
export type SoulForgeLaunchParsed = z.infer<typeof SoulForgeLaunchInputSchema>;

export interface SoulForgeLaunchResult {
  readonly agentDir: string;
  readonly tokenAddress: string | null;
  readonly txHash: string | null;
  readonly traceId: string;
  readonly bankrReceipt: BankrReceipt;
  readonly paymentReceipt: EndpointPaymentReceipt | null;
}

export type ScaffoldFn = (input: { readonly agentName: string; readonly outDir: string }) => {
  readonly agentDir: string;
};
export type EnvWriterFn = (envPath: string, vars: Record<string, string>) => void;

export interface SoulForgeLaunchOptions {
  readonly bankr?: BankrClient;
  readonly scaffold?: ScaffoldFn;
  readonly envWriter?: EnvWriterFn;
}

export class SoulForgeLaunchError extends Error {}

export class SoulForgeLauncher {
  private readonly bankr: BankrClient;
  private readonly scaffold: ScaffoldFn;
  private readonly envWriter: EnvWriterFn;

  constructor(options: SoulForgeLaunchOptions = {}) {
    this.bankr = options.bankr ?? new BankrClient();
    this.scaffold = options.scaffold ?? defaultScaffold;
    this.envWriter = options.envWriter ?? defaultEnvWriter;
  }

  async launch(raw: SoulForgeLaunchInput): Promise<SoulForgeLaunchResult> {
    const input = SoulForgeLaunchInputSchema.parse(raw);
    const traceId = input.traceId ?? crypto.randomUUID();

    if (!input.dryRun) {
      if (input.paymentReceipt === undefined) {
        throw new SoulForgeLaunchError("Live launches require an x402 payment receipt");
      }
      if (input.idempotencyKey === undefined) {
        throw new SoulForgeLaunchError("Live launches require an idempotencyKey");
      }
    }

    const { agentDir } = this.scaffold({ agentName: input.agentName, outDir: input.outDir });

    const deployInput: BankrDeployTokenInput = {
      name: input.tokenName,
      symbol: input.tokenSymbol,
      feeRecipient: { type: "x", value: input.twitterHandle },
      description: input.tokenDescription,
      imageUri: input.tokenImageUri,
      website: input.website,
      twitter: input.twitterHandle,
      telegram: input.telegram,
      network: "base",
      dryRun: input.dryRun,
      live: !input.dryRun,
      idempotencyKey: input.idempotencyKey,
      traceId,
      sessionId: input.agentName
    };
    const bankrReceipt = await this.bankr.deployToken(deployInput);

    const envPath = join(agentDir, ".env");
    this.envWriter(envPath, {
      AGENT_TOKEN_ADDRESS: bankrReceipt.tokenAddress ?? "",
      AGENT_TOKEN_SYMBOL: input.tokenSymbol,
      AGENT_TWITTER_HANDLE: input.twitterHandle
    });

    return {
      agentDir,
      tokenAddress: bankrReceipt.tokenAddress ?? null,
      txHash: bankrReceipt.txHash ?? null,
      traceId,
      bankrReceipt,
      paymentReceipt: input.paymentReceipt ?? null
    };
  }
}

function defaultScaffold(input: { readonly agentName: string; readonly outDir: string }): {
  readonly agentDir: string;
} {
  const result = spawnSync(
    "node",
    [
      defaultCliPath,
      "new",
      input.agentName,
      "--template",
      "token-agent",
      "--out",
      input.outDir,
      "--force"
    ],
    { stdio: "pipe", encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new SoulForgeLaunchError(`Scaffold failed: ${result.stderr || result.stdout}`);
  }
  return { agentDir: join(input.outDir, input.agentName) };
}

function defaultEnvWriter(envPath: string, vars: Record<string, string>): void {
  const examplePath = `${envPath}.example`;
  const seed = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : existsSync(examplePath)
      ? readFileSync(examplePath, "utf8")
      : "";
  let updated = seed;
  for (const [key, value] of Object.entries(vars)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`(^|\\n)${key}=.*`);
    updated = re.test(updated) ? updated.replace(re, `$1${line}`) : `${updated}\n${line}`;
  }
  writeFileSync(envPath, updated.startsWith("\n") ? updated.slice(1) : updated, "utf8");
}
