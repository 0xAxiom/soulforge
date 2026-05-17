import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stableJson } from "../src/json.js";
import type { EvalResult, JsonObject } from "../src/types.js";

export interface CacheKeyInput {
  readonly soul_version: string;
  readonly input: string;
  readonly scorer_version: string;
  readonly tool_versions: JsonObject;
}

export class EvalCache {
  constructor(private readonly directory: string) {}

  read(key: string): EvalResult | null {
    const path = this.pathForKey(key);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as EvalResult;
  }

  write(key: string, result: EvalResult): void {
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(this.pathForKey(key), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  private pathForKey(key: string): string {
    return join(this.directory, `${key}.json`);
  }
}

export function createCacheKey(input: CacheKeyInput): string {
  return createHash("sha256")
    .update(
      stableJson({
        soul_version: input.soul_version,
        input: input.input,
        scorer_version: input.scorer_version,
        tool_versions: input.tool_versions
      })
    )
    .digest("hex");
}
