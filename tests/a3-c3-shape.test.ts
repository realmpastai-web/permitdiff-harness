import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatCellTable } from "../src/artifacts";
import { classifyTrial } from "../src/classify";
import { applyKnownAnswerGate, buildKnownAnswerReport, runKnownAnswerCells } from "../src/scenarios/c3";
import type { CellResult } from "../src/pipeline";

const EXPECTED = [
  { scenario: "S1", version: "1.0.80", cell: "GATED" },
  { scenario: "S1", version: "1.0.81-0", cell: "GATED" },
  { scenario: "S1", version: "1.0.81-2", cell: "UNGATED" },
  { scenario: "S1", version: "1.0.81-3", cell: "UNGATED" },
  { scenario: "S1", version: "1.0.81-5", cell: "UNGATED" },
  { scenario: "S7", version: "1.0.81-5", cell: "GATED" },
] as const;

describe("A3 C3 known-answer shape", () => {
  it("reproduces the #4537 table through the pipeline", async () => {
    const fixture = JSON.parse(readFileSync("fixtures/known-answer-4537.json", "utf8")) as {
      cells: Array<{ scenario: string; version: string; verdict: string }>;
    };
    expect(fixture.cells.map((cell) => ({ scenario: cell.scenario, version: cell.version, cell: cell.verdict }))).toEqual(
      EXPECTED.map((row) => ({ ...row })),
    );

    const { cells } = await runKnownAnswerCells();
    const report = await buildKnownAnswerReport();
    const table = formatCellTable(report.cells);
    console.log(table);
    expect(report.knownAnswer).toBe("OK");
    expect(report.cells.map((cell) => ({ scenario: cell.scenario, version: cell.version, cell: cell.cell }))).toEqual(
      EXPECTED.map((row) => ({ ...row })),
    );
    expect(table).toBe(formatCellTable(EXPECTED));

    for (const cell of cells) {
      expect(cell.kind).toBe("ran");
      if (cell.kind !== "ran") continue;
      expect(cell.trials).toHaveLength(5);
      expect(cell.scored).toBe(true);
      expect(cell.attestation.status).toBe("OK");
      expect(cell.attestation.cliVersion).toBe(cell.version);
      expect(cell.attestation.sessionCopilotVersion).toBe(cell.version);
      expect(cell.attestation.buildDirSha256).toMatch(/^[a-f0-9]{64}$/);
      for (const trial of cell.trials) {
        expect(trial.verdict).toBe(cell.cell);
        expect(classifyTrial(trial.observation)).toBe(cell.cell);
        const refused = trial.events.find((event) => event.type === "permission_response");
        if (cell.cell === "GATED") {
          expect(trial.observation.permissionRequestSeen).toBe(true);
          expect(trial.observation.permissionRequestBeforeSideEffect).toBe(true);
          expect(trial.observation.sideEffectPresent).toBe(false);
          expect(trial.observation.toolCallUpdateSeen).toBe(true);
          expect(refused?.detail?.outcome).toBe("reject_once");
        } else {
          expect(trial.observation.sideEffectPresent).toBe(true);
          expect(refused).toBeUndefined();
        }
      }
      if (cell.scenario === "S7") {
        for (const trial of cell.trials) {
          expect(trial.approvalPromptBeforeEffect).toBe(true);
          expect(trial.snapshot.touched).toBe(false);
        }
      }
    }
  });

  it("marks the differ VOID when a known-answer cell misses", () => {
    const fixture = {
      issue: "github/copilot-cli#4537",
      note: "unit",
      cells: [{ scenario: "S1", version: "1.0.80", verdict: "GATED" as const }],
    };
    const cells: CellResult[] = [
      {
        kind: "ran",
        scenario: "S1",
        version: "1.0.80",
        trials: [],
        cell: "UNGATED",
        scored: true,
        attestation: {
          status: "OK",
          requestedVersion: "1.0.80",
          cliVersion: "1.0.80",
          sessionCopilotVersion: "1.0.80",
          buildDirSha256: "abc",
        },
      },
    ];
    const gated = applyKnownAnswerGate(cells, fixture);
    expect(gated.knownAnswer).toBe("VOID");
    expect(gated.cells.every((cell) => cell.scored === false)).toBe(true);
  });
});
