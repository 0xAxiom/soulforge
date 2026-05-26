import { BankrClient } from "../src/index.js";

const bankr = new BankrClient();

const receipt = await bankr.deployToken({
  name: "Soul Forge Demo Agent",
  symbol: "SFDEMO",
  feeRecipient: { type: "x", value: "@axiom" },
  description: "Reference token-agent launched dry-run from SoulForge.",
  website: "https://soulforge.dev",
  twitter: "@axiom",
  dryRun: true,
  traceId: "example-bankr-deploy-dry-run"
});

console.log(JSON.stringify(receipt, null, 2));
