#!/usr/bin/env node
// Soul validator. Parses YAML frontmatter from a markdown soul and validates
// it against souls/schema/soul.schema.json.
//
// Usage:
//   node souls/validate.mjs                       # validate every souls/examples/*.md
//   node souls/validate.mjs path/to/soul.md ...   # validate the given files
//
// Exits non-zero on first failure with a readable error.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const schemaPath = join(here, "schema", "soul.schema.json");
const examplesDir = join(here, "examples");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function listExampleSouls() {
  return readdirSync(examplesDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(examplesDir, f));
}

function validateFile(absPath) {
  const rel = relative(repoRoot, absPath);
  let raw;
  try {
    raw = readFileSync(absPath, "utf8");
  } catch (err) {
    return { path: rel, ok: false, errors: [`cannot read file: ${err.message}`] };
  }

  const parsed = matter(raw);
  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    return {
      path: rel,
      ok: false,
      errors: ["no YAML frontmatter found — soul files must begin with `---` ... `---`"],
    };
  }

  const ok = validate(parsed.data);
  if (ok) return { path: rel, ok: true, frontmatter: parsed.data };

  const errors = (validate.errors ?? []).map((e) => {
    const where = e.instancePath || "/";
    return `${where} ${e.message}${e.params ? ` (${JSON.stringify(e.params)})` : ""}`;
  });
  return { path: rel, ok: false, errors };
}

function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args.map((p) => resolve(p)) : listExampleSouls();

  if (targets.length === 0) {
    console.error("no soul files to validate (souls/examples/ is empty and no paths given)");
    process.exit(2);
  }

  let failed = 0;
  for (const t of targets) {
    const result = validateFile(t);
    if (result.ok) {
      console.log(`  ok  ${result.path}  (name=${result.frontmatter.name} v${result.frontmatter.version})`);
    } else {
      failed++;
      console.log(`  FAIL  ${result.path}`);
      for (const e of result.errors) console.log(`        ${e}`);
    }
  }

  if (failed > 0) {
    console.log(`\n${failed} soul${failed === 1 ? "" : "s"} failed validation`);
    process.exit(1);
  }
  console.log(`\nall ${targets.length} soul${targets.length === 1 ? "" : "s"} valid`);
}

main();
