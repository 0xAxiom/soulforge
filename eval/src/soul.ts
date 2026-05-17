import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SoulMetadata } from "./types.js";

export function loadSoul(path: string): SoulMetadata {
  const absolutePath = resolve(path);
  const raw = readFileSync(absolutePath, "utf8");
  const frontmatter = parseFrontmatter(raw);
  const name = readRequiredString(frontmatter, "name");
  const version = readRequiredString(frontmatter, "version");
  const refuses = readOptionalStringList(frontmatter, "refuses");
  return {
    name,
    version,
    soul_version: `${name}@${version}`,
    refuses,
    content: raw,
    path: absolutePath
  };
}

function parseFrontmatter(raw: string): Map<string, string | string[]> {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") throw new Error("Soul file must start with YAML frontmatter");
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) throw new Error("Soul file has no closing frontmatter marker");
  const values = new Map<string, string | string[]>();
  let listKey: string | null = null;
  for (const line of lines.slice(1, end)) {
    const keyMatch = /^([a-zA-Z_][a-zA-Z0-9_]*):(?:\s*(.*))?$/.exec(line);
    if (keyMatch) {
      const key = keyMatch[1];
      if (key === undefined) throw new Error("Invalid frontmatter key");
      const value = keyMatch[2] ?? "";
      if (value.trim().length === 0) {
        values.set(key, []);
        listKey = key;
      } else {
        values.set(key, value.trim());
        listKey = null;
      }
      continue;
    }
    const itemMatch = /^\s+-\s+(.*)$/.exec(line);
    if (itemMatch && listKey !== null) {
      const existing = values.get(listKey);
      if (!Array.isArray(existing)) throw new Error(`Frontmatter key ${listKey} is not a list`);
      existing.push(itemMatch[1]?.trim() ?? "");
    }
  }
  return values;
}

function readRequiredString(values: Map<string, string | string[]>, key: string): string {
  const value = values.get(key);
  if (typeof value !== "string" || value.length === 0) throw new Error(`Soul frontmatter missing ${key}`);
  return value;
}

function readOptionalStringList(values: Map<string, string | string[]>, key: string): string[] {
  const value = values.get(key);
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Soul frontmatter ${key} must be a list`);
  return value;
}
