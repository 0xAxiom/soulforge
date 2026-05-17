import { homedir } from "node:os";
import { join } from "node:path";

export function defaultEvalDir(): string {
  return process.env.SOULFORGE_EVAL_DIR ?? join(homedir(), ".soulforge", "eval");
}

export function defaultTracePath(label: string, evalDir = defaultEvalDir()): string {
  const safeLabel = label.replace(/[^a-zA-Z0-9_.-]/g, "-");
  return join(evalDir, "traces", `${safeLabel}-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
}

export function defaultCacheDir(evalDir = defaultEvalDir()): string {
  return join(evalDir, "cache");
}
