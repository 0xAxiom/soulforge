import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SoulForgeLauncher } from "./launch.js";

const outDir = mkdtempSync(join(tmpdir(), "sflaunch-demo-"));
const launcher = new SoulForgeLauncher();

const result = await launcher.launch({
  agentName: "demo-token-agent",
  agentDescription: "Demo token-bonded agent launched dry-run via SoulForge.",
  twitterHandle: "@axiom",
  tokenName: "SoulForge Demo",
  tokenSymbol: "SFDEMO",
  tokenDescription: "Reference token bonded to a SoulForge demo agent.",
  outDir,
  dryRun: true
});

console.log(JSON.stringify(result, null, 2));
