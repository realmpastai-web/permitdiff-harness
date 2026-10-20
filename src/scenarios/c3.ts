import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatCellTable, formatSha256Sums } from "../artifacts";
import type { Verdict } from "../classify";
import { loadKnownAnswerFixture, type Fixture } from "../fixture";
import { sha256Bytes } from "../hash";
import { runCell, type CellResult } from "../pipeline";
import { scenarioById, skippedInCi } from "./index";

export interface ReportCell {
  scenario: string;
  version: string;
  trials: Verdict[];
  cell: Verdict;
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

function toReportCell(cell: CellResult): ReportCell {
  if (cell.kind !== "ran") throw new Error(`scenario ${cell.scenario} was skipped`);
  return {
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
    cells: gated.cells.map(toReportCell),
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
  const sums = formatSha256Sums([
    { file: "artifacts/c3-table.txt", hash: sha256Bytes(table) },
    { file: "artifacts/run.json", hash: sha256Bytes(json) },
  ]);
  await writeFile(path.join(root, "SHA256SUMS"), sums);
  return report;
}
