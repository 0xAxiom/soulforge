import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ObservationEvent, ObservabilitySink } from "./types.js";

export function defaultObservabilityDir(): string {
  return process.env.SOULFORGE_OBS_DIR ?? join(homedir(), ".soulforge", "obs");
}

export function dailyObservabilityPath(rootDir = defaultObservabilityDir(), date = new Date()): string {
  return join(rootDir, `${date.toISOString().slice(0, 10)}.jsonl`);
}

export class JsonlObservabilitySink implements ObservabilitySink {
  constructor(private readonly path = dailyObservabilityPath()) {}

  emit(event: ObservationEvent): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(event)}\n`, "utf8");
  }

  read(): ObservationEvent[] {
    try {
      return readJsonlEvents(readFileSync(this.path, "utf8"));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}

export class MemoryObservabilitySink implements ObservabilitySink {
  private readonly events: ObservationEvent[] = [];

  emit(event: ObservationEvent): void {
    this.events.push(event);
  }

  read(): ObservationEvent[] {
    return [...this.events];
  }
}

export function readJsonlEvents(raw: string): ObservationEvent[] {
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ObservationEvent);
}
