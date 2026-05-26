import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import matter from "gray-matter";

export interface SoulStateInput {
  soul_path?: string;
}

export interface SoulStateOutput {
  name: string;
  version: string;
  model_hint: string | null;
  capabilities: string[];
  refusals: string[];
  voice_notes: string | null;
  raw_markdown: string;
}

const soulsDir = resolve(
  new URL("../../../..", import.meta.url).pathname,
  "souls/examples"
);

export function soulState(input: SoulStateInput): SoulStateOutput {
  const name = input.soul_path ?? "starter-soul.md";
  // resolve relative to souls/examples if no path separator
  const absPath =
    name.includes("/") || name.includes("\\")
      ? resolve(name)
      : join(soulsDir, name.endsWith(".md") ? name : `${name}.md`);

  const raw = readFileSync(absPath, "utf8");
  const { data } = matter(raw);

  const fm = data as Record<string, unknown>;

  return {
    name: typeof fm["name"] === "string" ? fm["name"] : "(unknown)",
    version: typeof fm["version"] === "string" ? fm["version"] : "0.0.0",
    model_hint: typeof fm["provider_hint"] === "string" ? fm["provider_hint"] : null,
    capabilities: Array.isArray(fm["scope"])
      ? (fm["scope"] as unknown[]).map(String)
      : [],
    refusals: Array.isArray(fm["refuses"])
      ? (fm["refuses"] as unknown[]).map(String)
      : [],
    voice_notes: typeof fm["voice_notes"] === "string" ? fm["voice_notes"] : null,
    raw_markdown: raw,
  };
}

export function soulIntro(input: SoulStateInput): string {
  const state = soulState(input);
  const caps =
    state.capabilities.length > 0
      ? state.capabilities.map((c) => `- ${c}`).join("\n")
      : "- (no capabilities listed)";
  const refs =
    state.refusals.length > 0
      ? state.refusals.map((r) => `- ${r}`).join("\n")
      : "- (no explicit refusals)";
  return [
    `**${state.name}** (v${state.version})`,
    "",
    "Capabilities:",
    caps,
    "",
    "Will not:",
    refs,
    ...(state.voice_notes ? ["", `Voice: ${state.voice_notes}`] : []),
  ].join("\n");
}

export function rawSoul(name: string): string {
  const absPath =
    name.includes("/") || name.includes("\\")
      ? resolve(name)
      : join(soulsDir, name.endsWith(".md") ? name : `${name}.md`);
  return readFileSync(absPath, "utf8");
}

export function listSouls(): string[] {
  return readdirSync(soulsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}
