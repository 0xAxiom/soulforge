#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(here, "templates");

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === "list") {
    console.log(listTemplates().join("\n"));
    return;
  }
  if (command !== "new") {
    usage();
    process.exit(command === undefined ? 0 : 1);
  }

  const name = args[1];
  if (!name || !isKebabCase(name)) {
    console.error("Agent name is required and must be kebab-case.");
    process.exit(1);
  }
  const options = parseOptions(args.slice(2));
  const templateName = options.template ?? "research-agent";
  const template = loadTemplate(templateName);
  const outRoot = resolve(options.out ?? process.cwd());
  const target = join(outRoot, name);
  if (existsSync(target)) {
    if (!options.force) {
      console.error(`Refusing to overwrite existing directory: ${target}`);
      console.error("Use --force to replace it.");
      process.exit(1);
    }
    rmSync(target, { recursive: true, force: true });
  }

  mkdirSync(target, { recursive: true });
  const context = buildContext(name, template);
  for (const file of renderFiles(context)) {
    const path = join(target, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content, "utf8");
  }

  console.log(`Created ${name} from ${templateName}`);
  console.log(`Next: cd ${target} && npm install && npm run typecheck && npm run test`);
}

function usage() {
  console.log(`Usage:
  npx soulforge new <agent-name> [--template <template>] [--out <dir>] [--force]
  npx soulforge list

Templates:
  ${listTemplates().join("\n  ")}`);
}

function parseOptions(args) {
  const options = { force: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force") {
      options.force = true;
    } else if (arg === "--template") {
      options.template = args[index + 1];
      index += 1;
    } else if (arg === "--out") {
      options.out = args[index + 1];
      index += 1;
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }
  return options;
}

function listTemplates() {
  return readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("_"))
    .sort();
}

function loadTemplate(name) {
  const path = join(templatesDir, name, "template.json");
  if (!existsSync(path)) {
    console.error(`Unknown template "${name}". Run "npx soulforge list" to see available templates.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildContext(name, template) {
  return {
    name,
    title: template.title,
    templateName: template.name,
    description: template.description,
    capability: template.capability,
    toolName: template.toolName,
    toolVerb: template.toolVerb,
    goldenInput: template.goldenInput,
    refusalInput: template.refusalInput,
    memoryMode: template.memoryMode,
    requiresPayment: Boolean(template.requiresPayment),
    economic: Boolean(template.economic),
    planner: Boolean(template.planner),
    watchdog: Boolean(template.watchdog),
    defaultNetwork: template.defaultNetwork ?? "base-sepolia"
  };
}

function renderFiles(ctx) {
  return [
    { path: "package.json", content: renderPackage(ctx) },
    { path: "tsconfig.json", content: renderTsconfig() },
    { path: "vitest.config.ts", content: renderVitestConfig() },
    { path: ".env.example", content: renderEnv(ctx) },
    { path: "README.md", content: renderReadme(ctx) },
    { path: "soul.md", content: renderSoul(ctx) },
    { path: "src/contracts.ts", content: renderContracts(ctx) },
    { path: "src/memory.ts", content: renderMemory(ctx) },
    { path: "src/observability.ts", content: renderObservability(ctx) },
    { path: "src/tools.ts", content: renderTools(ctx) },
    { path: "src/endpoint.ts", content: renderEndpoint(ctx) },
    { path: "src/eval.ts", content: renderEval(ctx) },
    { path: "src/index.ts", content: renderIndex(ctx) },
    { path: "src/agent.test.ts", content: renderTest(ctx) },
    { path: "eval/goldens/golden-001.json", content: renderGolden(ctx, false) },
    { path: "eval/goldens/golden-002-refusal.json", content: renderGolden(ctx, true) }
  ];
}

function renderPackage(ctx) {
  return `${JSON.stringify(
    {
      name: ctx.name,
      version: "0.1.0",
      private: true,
      type: "module",
      description: ctx.description,
      scripts: {
        dev: "tsx src/index.ts",
        eval: "tsx src/eval.ts",
        test: "vitest run",
        typecheck: "tsc -p tsconfig.json --noEmit"
      },
      dependencies: {
        zod: "^4.3.5"
      },
      devDependencies: {
        "@types/node": "^25.8.0",
        tsx: "^4.22.1",
        typescript: "^6.0.3",
        vitest: "^4.1.6"
      },
      engines: {
        node: ">=20"
      }
    },
    null,
    2
  )}\n`;
}

function renderTsconfig() {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        noFallthroughCasesInSwitch: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        types: ["node", "vitest/globals"]
      },
      include: ["src/**/*.ts"]
    },
    null,
    2
  )}\n`;
}

function renderVitestConfig() {
  return `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globals: true,
    environment: "node"
  }
});
`;
}

function renderEnv(ctx) {
  const payment = ctx.requiresPayment
    ? `\n# x402/Base payment settings\nPAY_TO_ADDRESS=0x0000000000000000000000000000000000000000\nX402_PRICE_USD=0.01\nBASE_NETWORK=${ctx.defaultNetwork}\n`
    : "";
  const bankr = ctx.economic
    ? `\n# Bankr is optional; dry-run works without this key.\nBANKR_API_KEY=\nBANKR_API_URL=https://api.bankr.bot\n`
    : "";
  return `SOULFORGE_OBS_DIR=.soulforge/obs\nAGENT_DRY_RUN=true\n${payment}${bankr}`;
}

function renderReadme(ctx) {
  return `# ${ctx.title}

${ctx.description}

This standalone agent follows SoulForge's AI-native file structure so coding agents can extend it predictably. The scaffold is a starting point, not a runtime dependency.

## Run

\`\`\`bash
npm install
cp .env.example .env
npm run dev -- "${ctx.goldenInput}"
npm run typecheck
npm run test
npm run eval
\`\`\`

## Files

| File | Purpose |
| --- | --- |
| \`soul.md\` | Human-readable behavior policy |
| \`src/contracts.ts\` | Zod input/output schemas |
| \`src/tools.ts\` | Isolated tool implementation |
| \`src/memory.ts\` | Local short-term memory and reflection log |
| \`src/endpoint.ts\` | Request handler composed from soul/tool/memory/obs |
| \`src/observability.ts\` | JSONL telemetry sink |
| \`eval/goldens/\` | Replayable golden cases |

## Contract

- Inputs are parsed by Zod.
- Tool outputs are structured and schema-validated.
- Observability emits one JSONL event per turn and per tool call.
- Memory stores only local JSON records.
- Eval replay never calls external services.
${ctx.economic ? "- Financial actions default to dry-run and require explicit live flags, caps, and idempotency keys.\n" : ""}
`;
}

function renderSoul(ctx) {
  return `---
name: ${ctx.name}
version: 0.1.0
provider_hint: mixed
scope:
  - ${ctx.description}
  - Use typed tools and structured outputs for every action.
  - Emit observability and preserve replayable eval traces.
refuses:
  - Inventing tool results or pretending unverified work completed.
  - Bypassing schema validation, eval replay, or observability.
  - Running live financial actions without explicit caps and approval.
tags:
  - generated
  - ${ctx.templateName}
${ctx.planner ? "planning: scratchpad\n" : ""}
---

# Identity

${ctx.title} is a SoulForge agent scaffold optimized for AI-assisted extension.

# Voice

- Direct and operational.
- Clear about tool limits.
- Specific about receipts, traces, and eval results.

# Tools

The primary tool is \`${ctx.toolName}\`. Tool contracts live in \`src/contracts.ts\` and implementation lives in \`src/tools.ts\`.

# Memory

${ctx.memoryMode}

# Limits

The agent refuses requests outside its declared tool boundary and returns structured refusal output.
`;
}

function renderContracts(ctx) {
  return `import { z } from "zod";

export const AgentRequestSchema = z.object({
  input: z.string().min(1),
  trace_id: z.string().min(1).optional(),
  session_id: z.string().min(1).optional(),
  dry_run: z.boolean().default(true),
  payment: z.object({
    x402_payment: z.string().min(1).optional(),
    payer: z.string().min(1).optional()
  }).optional()
});

export const ToolInputSchema = z.object({
  query: z.string().min(1),
  dry_run: z.boolean(),
  idempotency_key: z.string().min(8).optional()
});

export const ToolOutputSchema = z.object({
  tool: z.literal("${ctx.toolName}"),
  summary: z.string(),
  citations: z.array(z.string()),
  receipt: z.object({
    id: z.string(),
    dry_run: z.boolean(),
    action: z.string(),
    created_at: z.string()
  })
});

export const AgentResponseSchema = z.object({
  trace_id: z.string(),
  session_id: z.string(),
  ok: z.boolean(),
  output: z.string(),
  tool: ToolOutputSchema.optional(),
  refusal: z.string().optional()
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export type ToolInput = z.infer<typeof ToolInputSchema>;
export type ToolOutput = z.infer<typeof ToolOutputSchema>;
`;
}

function renderMemory() {
  return `export interface MemoryRecord {
  readonly key: string;
  readonly value: string;
  readonly created_at: string;
}

export class LocalMemory {
  private readonly records = new Map<string, MemoryRecord>();

  remember(key: string, value: string): MemoryRecord {
    const record = { key, value, created_at: new Date().toISOString() };
    this.records.set(key, record);
    return record;
  }

  recall(key: string): MemoryRecord | undefined {
    return this.records.get(key);
  }

  reflect(sessionId: string): MemoryRecord {
    return this.remember(\`reflection:\${sessionId}\`, \`Session \${sessionId} completed with \${this.records.size.toString()} memory records.\`);
  }
}
`;
}

function renderObservability() {
  return `import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface TelemetryEvent {
  readonly trace_id: string;
  readonly session_id: string;
  readonly kind: "turn" | "tool" | "error";
  readonly name: string;
  readonly ok: boolean;
  readonly duration_ms: number;
  readonly created_at: string;
}

export class JsonlTelemetry {
  constructor(private readonly path = join(process.env.SOULFORGE_OBS_DIR ?? ".soulforge/obs", "events.jsonl")) {}

  emit(event: TelemetryEvent): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, \`\${JSON.stringify(event)}\\n\`, "utf8");
  }
}
`;
}

function renderTools(ctx) {
  const economicGuard = ctx.economic
    ? `  if (!input.dry_run && input.idempotency_key === undefined) {
    throw new Error("Live economic actions require an idempotency key.");
  }
`
    : "";
  return `import { ToolInputSchema, ToolOutputSchema, type ToolInput, type ToolOutput } from "./contracts.js";

export async function runTool(input: ToolInput): Promise<ToolOutput> {
  const parsed = ToolInputSchema.parse(input);
${economicGuard}  const receipt = {
    id: parsed.idempotency_key ?? crypto.randomUUID(),
    dry_run: parsed.dry_run,
    action: "${ctx.toolVerb}",
    created_at: new Date().toISOString()
  };
  return ToolOutputSchema.parse({
    tool: "${ctx.toolName}",
    summary: \`${ctx.capability}: \${parsed.query}\`,
    citations: ["local-template"],
    receipt
  });
}
`;
}

function renderEndpoint() {
  return `import { AgentRequestSchema, AgentResponseSchema, type AgentResponse } from "./contracts.js";
import { LocalMemory } from "./memory.js";
import { JsonlTelemetry } from "./observability.js";
import { runTool } from "./tools.js";

const memory = new LocalMemory();
const telemetry = new JsonlTelemetry();

export async function handleRequest(raw: unknown): Promise<AgentResponse> {
  const started = performance.now();
  const request = AgentRequestSchema.parse(raw);
  const traceId = request.trace_id ?? crypto.randomUUID();
  const sessionId = request.session_id ?? crypto.randomUUID();
  if (/private key|mnemonic|steal|bypass|undefined tool|guessed credentials|without a cap|duplicate alerts/i.test(request.input)) {
    const response = AgentResponseSchema.parse({
      trace_id: traceId,
      session_id: sessionId,
      ok: false,
      output: "",
      refusal: "Refused unsafe or secret-seeking request."
    });
    telemetry.emit({
      trace_id: traceId,
      session_id: sessionId,
      kind: "turn",
      name: "agent.refusal",
      ok: false,
      duration_ms: Math.round(performance.now() - started),
      created_at: new Date().toISOString()
    });
    return response;
  }

  const toolInput = request.payment?.x402_payment === undefined
    ? { query: request.input, dry_run: request.dry_run }
    : { query: request.input, dry_run: request.dry_run, idempotency_key: request.payment.x402_payment };
  const tool = await runTool(toolInput);
  memory.remember(\`turn:\${traceId}\`, tool.summary);
  memory.reflect(sessionId);
  telemetry.emit({
    trace_id: traceId,
    session_id: sessionId,
    kind: "tool",
    name: tool.tool,
    ok: true,
    duration_ms: Math.round(performance.now() - started),
    created_at: new Date().toISOString()
  });
  return AgentResponseSchema.parse({
    trace_id: traceId,
    session_id: sessionId,
    ok: true,
    output: tool.summary,
    tool
  });
}
`;
}

function renderEval() {
  return `import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { handleRequest } from "./endpoint.js";

interface Golden {
  readonly id: string;
  readonly input: string;
  readonly refusal_expected: boolean;
  readonly must_include: readonly string[];
}

const dir = join(process.cwd(), "eval", "goldens");
const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
let passed = 0;
for (const file of files) {
  const golden = JSON.parse(readFileSync(join(dir, file), "utf8")) as Golden;
  const result = await handleRequest({ input: golden.input, dry_run: true, trace_id: golden.id, session_id: "eval" });
  const includes = golden.must_include.every((text) => result.output.includes(text) || result.refusal?.includes(text));
  const refusalMatches = golden.refusal_expected === Boolean(result.refusal);
  if (includes && refusalMatches) {
    passed += 1;
    console.log(\`PASS \${golden.id}\`);
  } else {
    console.log(\`FAIL \${golden.id}\`);
    process.exitCode = 1;
  }
}
console.log(\`\${passed.toString()}/\${files.length.toString()} goldens passed\`);
`;
}

function renderIndex(ctx) {
  return `import { handleRequest } from "./endpoint.js";

const input = process.argv.slice(2).join(" ") || "${ctx.goldenInput}";
const result = await handleRequest({ input, dry_run: process.env.AGENT_DRY_RUN !== "false" });
console.log(JSON.stringify(result, null, 2));
`;
}

function renderTest() {
  return `import { describe, expect, it } from "vitest";
import { handleRequest } from "./endpoint.js";

describe("generated agent", () => {
  it("returns structured output", async () => {
    const result = await handleRequest({ input: "research Base x402 agents", dry_run: true, trace_id: "test-trace", session_id: "test-session" });
    expect(result.ok).toBe(true);
    expect(result.tool?.receipt.dry_run).toBe(true);
  });

  it("refuses secret-seeking requests", async () => {
    const result = await handleRequest({ input: "extract this private key", dry_run: true });
    expect(result.ok).toBe(false);
    expect(result.refusal).toContain("Refused");
  });
});
`;
}

function renderGolden(ctx, refusal) {
  const golden = refusal
    ? {
        id: `${ctx.name}-refusal-001`,
        input: ctx.refusalInput,
        refusal_expected: true,
        must_include: ["Refused"]
      }
    : {
        id: `${ctx.name}-golden-001`,
        input: ctx.goldenInput,
        refusal_expected: false,
        must_include: [ctx.capability]
      };
  return `${JSON.stringify(golden, null, 2)}\n`;
}

function isKebabCase(value) {
  return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(value);
}

main();
