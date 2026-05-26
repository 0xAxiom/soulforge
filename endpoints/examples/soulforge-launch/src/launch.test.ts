import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BankrClient,
  type BankrHttpResponse,
  type BankrTransport
} from "../../../../tools/bankr/src/index.js";
import {
  SoulForgeLaunchError,
  SoulForgeLauncher,
  type ScaffoldFn
} from "./launch.js";

function makeFakeScaffold(): ScaffoldFn {
  return ({ agentName, outDir }) => {
    const agentDir = join(outDir, agentName);
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, ".env.example"),
      [
        "SOULFORGE_OBS_DIR=.soulforge/obs",
        "AGENT_DRY_RUN=true",
        "AGENT_TOKEN_ADDRESS=",
        "AGENT_TOKEN_SYMBOL=",
        "AGENT_TWITTER_HANDLE="
      ].join("\n"),
      "utf8"
    );
    return { agentDir };
  };
}

class FakeBankrTransport implements BankrTransport {
  readonly requests: { readonly path: string; readonly body?: string | undefined }[] = [];
  constructor(private readonly payload: unknown) {}
  request(path: string, init: { readonly method: string; readonly headers: Record<string, string>; readonly body?: string }): Promise<BankrHttpResponse> {
    this.requests.push({ path, body: init.body });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(this.payload),
      text: () => Promise.resolve(JSON.stringify(this.payload))
    });
  }
}

describe("SoulForgeLauncher", () => {
  it("dry-runs end-to-end with no Bankr key", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sflaunch-"));
    const launcher = new SoulForgeLauncher({ scaffold: makeFakeScaffold() });

    const result = await launcher.launch({
      agentName: "axiom-token-agent",
      agentDescription: "Reference token-bonded agent dry-run.",
      twitterHandle: "@axiom",
      tokenName: "Axiom Reference",
      tokenSymbol: "AXR",
      outDir,
      dryRun: true,
      traceId: "trace-launch-dry-run"
    });

    expect(result.bankrReceipt.status).toBe("simulated");
    expect(result.tokenAddress).toBeNull();
    expect(result.txHash).toBeNull();
    expect(existsSync(join(result.agentDir, ".env"))).toBe(true);
    const env = readFileSync(join(result.agentDir, ".env"), "utf8");
    expect(env).toContain("AGENT_TOKEN_SYMBOL=AXR");
    expect(env).toContain("AGENT_TWITTER_HANDLE=@axiom");
    expect(env).toContain("AGENT_TOKEN_ADDRESS=");
  });

  it("refuses live launches without a payment receipt", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sflaunch-"));
    const launcher = new SoulForgeLauncher({ scaffold: makeFakeScaffold() });

    await expect(
      launcher.launch({
        agentName: "axiom-token-agent",
        agentDescription: "Reference token-bonded agent live without payment.",
        twitterHandle: "@axiom",
        tokenName: "Axiom Reference",
        tokenSymbol: "AXR",
        outDir,
        dryRun: false,
        idempotencyKey: "deploy-axiom-001"
      })
    ).rejects.toBeInstanceOf(SoulForgeLaunchError);
  });

  it("refuses live launches without an idempotencyKey", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sflaunch-"));
    const launcher = new SoulForgeLauncher({ scaffold: makeFakeScaffold() });

    await expect(
      launcher.launch({
        agentName: "axiom-token-agent",
        agentDescription: "Reference token-bonded agent live without idempotency.",
        twitterHandle: "@axiom",
        tokenName: "Axiom Reference",
        tokenSymbol: "AXR",
        outDir,
        dryRun: false,
        paymentReceipt: {
          provider: "x402",
          network: "base",
          amount_usd: "1.00",
          payer: "0x0000000000000000000000000000000000000001",
          pay_to: "0x523Eff3dB03938eaa31a5a6FBd41E3B9d23edde5",
          receipt_id: "x402-test-receipt-001",
          settled_at: "2026-05-18T20:00:00.000Z"
        }
      })
    ).rejects.toBeInstanceOf(SoulForgeLaunchError);
  });

  it("rejects non-kebab-case agent names", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sflaunch-"));
    const launcher = new SoulForgeLauncher({ scaffold: makeFakeScaffold() });

    await expect(
      launcher.launch({
        agentName: "BadName",
        agentDescription: "Should fail at schema parse.",
        twitterHandle: "@axiom",
        tokenName: "Axiom Reference",
        tokenSymbol: "AXR",
        outDir,
        dryRun: true
      })
    ).rejects.toThrow();
  });

  it("runs the live path end-to-end with injected Bankr transport", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sflaunch-"));
    const transport = new FakeBankrTransport({
      tokenAddress: "0xdb07000000000000000000000000000000000cba",
      txHash: "0xf39e000000000000000000000000000000008b9a",
      activityId: "act-launch-001"
    });
    const launcher = new SoulForgeLauncher({
      scaffold: makeFakeScaffold(),
      bankr: new BankrClient({ apiKey: "bk_test", transport })
    });

    const result = await launcher.launch({
      agentName: "axiom-token-agent",
      agentDescription: "Reference token-bonded agent live with payment + idempotency.",
      twitterHandle: "@axiom",
      tokenName: "Axiom Reference",
      tokenSymbol: "AXR",
      outDir,
      dryRun: false,
      idempotencyKey: "deploy-axiom-001",
      paymentReceipt: {
        provider: "x402",
        network: "base",
        amount_usd: "1.00",
        payer: "0x0000000000000000000000000000000000000001",
        pay_to: "0x523Eff3dB03938eaa31a5a6FBd41E3B9d23edde5",
        receipt_id: "x402-test-receipt-001",
        settled_at: "2026-05-18T20:00:00.000Z"
      }
    });

    expect(result.tokenAddress).toBe("0xdb07000000000000000000000000000000000cba");
    expect(result.txHash).toBe("0xf39e000000000000000000000000000000008b9a");
    expect(transport.requests[0]?.path).toBe("/token-launches/deploy");
    const env = readFileSync(join(result.agentDir, ".env"), "utf8");
    expect(env).toContain("AGENT_TOKEN_ADDRESS=0xdb07000000000000000000000000000000000cba");
    expect(env).toContain("AGENT_TOKEN_SYMBOL=AXR");
    expect(env).toContain("AGENT_TWITTER_HANDLE=@axiom");
  });
});
