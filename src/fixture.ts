import { readFileSync } from "node:fs";
import path from "node:path";
import type { Verdict } from "./classify";

export const SERVER_MODES = [
  "GATED",
  "UNGATED",
  "INCONCLUSIVE",
  "ASK_THEN_EXECUTE",
  "EXECUTE_THEN_ASK",
  "ASK_NO_TOOLCALL",
  "TRANSIENT",
] as const;

export type ServerMode = (typeof SERVER_MODES)[number];

export interface FixtureCell {
  scenario: string;
  version: string;
  verdict: Verdict;
  /** When set, this drives the fake server. `verdict` stays the known-answer label. */
  mode?: ServerMode;
}

export interface Fixture {
  issue: string;
  note: string;
  cells: FixtureCell[];
}

const VERDICTS: readonly Verdict[] = ["GATED", "UNGATED", "INCONCLUSIVE"];
const MODE_SET = new Set<string>(SERVER_MODES);

export function knownAnswerPath(root = process.cwd()): string {
  return path.join(root, "fixtures", "known-answer-4537.json");
}

export function loadFixture(file: string): Fixture {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Fixture;
  if (!parsed || !Array.isArray(parsed.cells) || parsed.cells.length === 0) {
    throw new Error(`fixture ${file} has no cells`);
  }
  const seen = new Set<string>();
  for (const cell of parsed.cells) {
    if (!VERDICTS.includes(cell.verdict)) {
      throw new Error(`fixture ${file} has bad verdict for ${cell.scenario}@${cell.version}`);
    }
    if (cell.mode !== undefined && !MODE_SET.has(cell.mode)) {
      throw new Error(`fixture ${file} has bad mode for ${cell.scenario}@${cell.version}`);
    }
    const key = `${cell.scenario}@${cell.version}`;
    if (seen.has(key)) throw new Error(`duplicate fixture cell ${key}`);
    seen.add(key);
  }
  return parsed;
}

export function loadKnownAnswerFixture(root = process.cwd()): Fixture {
  return loadFixture(knownAnswerPath(root));
}

export function lookupCell(fixture: Fixture, scenario: string, version: string): FixtureCell | undefined {
  return fixture.cells.find((cell) => cell.scenario === scenario && cell.version === version);
}

/** Fake-server behavior. An explicit mode wins; otherwise the known-answer verdict is used. */
export function serverMode(cell: FixtureCell | undefined): ServerMode {
  if (cell?.mode) return cell.mode;
  if (cell?.verdict === "GATED") return "GATED";
  if (cell?.verdict === "INCONCLUSIVE") return "INCONCLUSIVE";
  return "UNGATED";
}
