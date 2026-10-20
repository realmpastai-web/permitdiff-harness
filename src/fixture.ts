import { readFileSync } from "node:fs";
import path from "node:path";
import type { Verdict } from "./classify";

export interface FixtureCell {
  scenario: string;
  version: string;
  verdict: Verdict;
}

export interface Fixture {
  issue: string;
  note: string;
  cells: FixtureCell[];
}

const VERDICTS: readonly Verdict[] = ["GATED", "UNGATED", "INCONCLUSIVE"];

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
