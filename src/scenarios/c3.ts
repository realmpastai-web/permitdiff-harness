import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatCellTable, formatSha256Sums } from "../artifacts";
import type { TrialReasonCode, Verdict } from "../classify";
import { loadKnownAnswerFixture, type Fixture } from "../fixture";
import { sha256Bytes } from "../hash";
import { runCell, type CellResult } from "../pipeline";
import type { CoverageClock } from "../watcher";
import { scenarioById, skippedInCi } from "./index";

export interface ReportCell {
  scenario: string;
  version: string;
  trials: Verdict[];
  cell: Verdict;
  /** Present only when a trial carries Amendment 1 reason UNGATED_NO_TOOLCALL or Amendment 2 VOID_NO_INOTIFY. */
  reasonCodes?: TrialReasonCode[];
  trialReasons?: TrialReasonCode[][];
  /** Present only on licensed / PERMITDIFF_REQUIRE_INOTIFY reports. One clock list per trial. */
  trialClocks?: CoverageClock[][];
  /** Present on VOID cells and on licensed / required-mode reports. */
  trialsRun?: number;
  scored: boolean;
  attestation: {
    status: "OK" | "VOID";
    requestedVersion: string;
    cliVersion: string;
    sessionCopilotVersion: string;
    buildDirSha256: string;
  };
}

export interface KnownAnswerReport {
  mode: "mock";
  realRun: "HELD";
  knownAnswer: "OK" | "VOID";
  cells: ReportCell[];
  ciSweepSkipped: Array<{ id: string; reason: string }>;
}

export function applyKnownAnswerGate(
  cells: readonly CellResult[],
  fixture: Fixture,
): { knownAnswer: "OK" | "VOID"; cells: CellResult[] } {
  const miss = fixture.cells.some((entry, index) => {
    const cell = cells[index];
    return (
      !cell ||
      cell.kind !== "ran" ||
      cell.scenario !== entry.scenario ||
      cell.version !== entry.version ||
      cell.cell !== entry.verdict ||
      !cell.scored
    );
  });
  if (!miss) return { knownAnswer: "OK", cells: [...cells] };
  return {
    knownAnswer: "VOID",
    cells: cells.map((cell) => (cell.kind === "ran" ? { ...cell, scored: false } : cell)),
  };
}

export function clocksForRunJson(
  trials: readonly { coverageClocks: readonly CoverageClock[] }[],
  licensed: boolean,
): CoverageClock[][] | undefined {
  if (!licensed) return undefined;
  return trials.map((trial) => [...trial.coverageClocks]);
}

export function toReportCell(cell: CellResult, opts?: { licensed?: boolean }): ReportCell {
  if (cell.kind !== "ran") throw new Error(`scenario ${cell.scenario} was skipped`);
  const trialReasons = cell.trials.map((trial) => trial.reasonCodes);
  const reasonCodes = [...new Set(trialReasons.flat())];
  const report: ReportCell = {
    scenario: cell.scenario,
    version: cell.version,
    trials: cell.trials.map((trial) => trial.verdict),
    cell: cell.cell,
    scored: cell.scored,
    attestation: {
      status: cell.attestation.status,
      requestedVersion: cell.attestation.requestedVersion,
      cliVersion: cell.attestation.cliVersion,
      sessionCopilotVersion: cell.attestation.sessionCopilotVersion,
      buildDirSha256: cell.attestation.buildDirSha256,
    },
  };
  if (reasonCodes.length > 0) {
    report.reasonCodes = reasonCodes;
    report.trialReasons = trialReasons;
  }
  const trialClocks = clocksForRunJson(cell.trials, opts?.licensed === true);
  if (trialClocks) report.trialClocks = trialClocks;
  if (cell.cell === "VOID" || opts?.licensed === true) report.trialsRun = cell.trialsRun;
  return report;
}

let cachedCells: Promise<{ fixture: Fixture; cells: CellResult[] }> | undefined;

export function runKnownAnswerCells(root = process.cwd()): Promise<{ fixture: Fixture; cells: CellResult[] }> {
  if (!cachedCells) {
    cachedCells = runUncached(root).catch((err: unknown) => {
      cachedCells = undefined;
      throw err;
    });
  }
  return cachedCells;
}

async function runUncached(root: string): Promise<{ fixture: Fixture; cells: CellResult[] }> {
  const fixture = loadKnownAnswerFixture(root);
  const buildDir = path.join(root, "fixtures");
  const cells: CellResult[] = [];
  for (const entry of fixture.cells) {
    cells.push(
      await runCell({
        scenario: scenarioById(entry.scenario),
        version: entry.version,
        fixture,
        buildDir,
        policy: "reject_once",
        allowRequiresRealCli: true,
      }),
    );
  }
  return { fixture, cells };
}

export async function buildKnownAnswerReport(root = process.cwd()): Promise<KnownAnswerReport> {
  const { fixture, cells } = await runKnownAnswerCells(root);
  const gated = applyKnownAnswerGate(cells, fixture);
  return {
    mode: "mock",
    realRun: "HELD",
    knownAnswer: gated.knownAnswer,
    cells: gated.cells.map((cell) => toReportCell(cell)),
    ciSweepSkipped: skippedInCi().map((scenario) => ({
      id: scenario.id,
      reason: scenario.skipReason ?? "",
    })),
  };
}

export async function emitKnownAnswerArtifacts(root = process.cwd()): Promise<KnownAnswerReport> {
  const report = await buildKnownAnswerReport(root);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const table = formatCellTable(report.cells);
  const artifactsDir = path.join(root, "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(path.join(artifactsDir, "run.json"), json);
  await writeFile(path.join(artifactsDir, "c3-table.txt"), table);
  const amendment1 = await readFile(path.join(root, "docs", "AMENDMENT-1.md"));
  const amendment2 = await readFile(path.join(root, "docs", "AMENDMENT-2.md"));
  const amendment3 = await readFile(path.join(root, "docs", "AMENDMENT-3.md"));
  const sums = formatSha256Sums([
    { file: "artifacts/c3-table.txt", hash: sha256Bytes(table) },
    { file: "artifacts/run.json", hash: sha256Bytes(json) },
    { file: "docs/AMENDMENT-1.md", hash: sha256Bytes(amendment1) },
    { file: "docs/AMENDMENT-2.md", hash: sha256Bytes(amendment2) },
    { file: "docs/AMENDMENT-3.md", hash: sha256Bytes(amendment3) },
  ]);
  await writeFile(path.join(root, "SHA256SUMS"), sums);
  return report;
}
