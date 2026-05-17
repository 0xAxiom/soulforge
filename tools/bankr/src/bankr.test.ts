import { describe, expect, it } from "vitest";
import { MemoryObservabilitySink } from "../../../observability/src/index.js";
import { BankrClient, BankrSafetyError, type BankrHttpResponse, type BankrTransport } from "./index.js";

describe("BankrClient", () => {
  it("dry-runs swaps without network access", async () => {
    const sink = new MemoryObservabilitySink();
    const client = new BankrClient({ observability: sink });

    const receipt = await client.swap({
      fromToken: "USDC",
      toToken: "ETH",
      amountUsd: 5,
      network: "base-sepolia",
      dryRun: true,
      traceId: "trace-dry-run"
    });

    expect(receipt.status).toBe("simulated");
    expect(receipt.jobId).toBeNull();
    expect(sink.read()[0]?.tool).toBe("bankr");
  });

  it("rejects live swaps without spending cap and idempotency", async () => {
    const client = new BankrClient();

    await expect(
      client.swap({
        fromToken: "USDC",
        toToken: "ETH",
        amountUsd: 5,
        network: "base-sepolia",
        dryRun: false,
        live: true
      })
    ).rejects.toBeInstanceOf(BankrSafetyError);
  });

  it("submits live guarded swaps through the Bankr Agent API", async () => {
    const transport = new FakeBankrTransport({ success: true, jobId: "job-123" });
    const client = new BankrClient({ apiKey: "bk_test", transport });

    const receipt = await client.swap({
      fromToken: "USDC",
      toToken: "ETH",
      amountUsd: 5,
      spendingCapUsd: 5,
      network: "base-sepolia",
      dryRun: false,
      live: true,
      idempotencyKey: "trade-001"
    });

    expect(receipt.status).toBe("submitted");
    expect(receipt.jobId).toBe("job-123");
    expect(transport.requests[0]?.headers["x-api-key"]).toBe("bk_test");
  });
});

class FakeBankrTransport implements BankrTransport {
  readonly requests: { readonly path: string; readonly headers: Record<string, string>; readonly body?: string | undefined }[] = [];

  constructor(private readonly payload: unknown) {}

  request(path: string, init: { readonly method: string; readonly headers: Record<string, string>; readonly body?: string }): Promise<BankrHttpResponse> {
    this.requests.push({ path, headers: init.headers, body: init.body });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(this.payload),
      text: () => Promise.resolve(JSON.stringify(this.payload))
    });
  }
}
