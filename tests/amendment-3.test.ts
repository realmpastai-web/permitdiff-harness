import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadKnownAnswerFixture } from "../src/fixture";
import { runCell, type CellResult } from "../src/pipeline";
import { s1 } from "../src/scenarios/s1";
import { toReportCell } from "../src/scenarios/c3";
import { MockTransport, type Transport } from "../src/transport";

const buildDir = path.join(process.cwd(), "fixtures");
const missingInotify = path.join(buildDir, "missing-inotifywait");

async function fakeInotifywait(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "permitdiff-inotify-"));
  const bin = path.join(dir, "inotifywait");
  await writeFile(
    bin,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) process.exit(0);
process.stderr.write("Watches established.\\n");
setInterval(() => {}, 1 << 30);
process.on("SIGTERM", () => process.exit(0));
`,
  );
  await chmod(bin, 0o755);
  return bin;
}

function withInotifyRequired<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.PERMITDIFF_REQUIRE_INOTIFY;
  process.env.PERMITDIFF_REQUIRE_INOTIFY = "1";
  return run().finally(() => {
    if (previous === undefined) delete process.env.PERMITDIFF_REQUIRE_INOTIFY;
    else process.env.PERMITDIFF_REQUIRE_INOTIFY = previous;
  });
}

describe("Amendment 3 VOID early stop", () => {
  it("stops after the first VOID trial and records trialsRun=1", async () => {
    let started = 0;
    const transport: Transport = {
      mode: "mock",
      start: async () => {
        started += 1;
        throw new Error("session must not start");
      },
    };
    const cell = await withInotifyRequired(() =>
      runCell({
        scenario: s1,
        version: "1.0.80",
        fixture: loadKnownAnswerFixture(),
        buildDir,
        policy: "reject_once",
        transport,
        inotifyBin: missingInotify,
        trials: 5,
      }),
    );
    expect(cell.kind).toBe("ran");
    if (cell.kind !== "ran") return;
    const report = toReportCell(cell);
    console.log(
      `EARLY_STOP first VOID trialsRun=${cell.trialsRun} started=${started} cell=${cell.cell} scored=${cell.scored} json=${JSON.stringify({ trialsRun: report.trialsRun, cell: report.cell })}`,
    );
    expect(started).toBe(0);
    expect(cell.trials).toHaveLength(1);
    expect(cell.trialsRun).toBe(1);
    expect(cell.trials[0]?.verdict).toBe("VOID");
    expect(cell.cell).toBe("VOID");
    expect(cell.scored).toBe(false);
    expect(cell.attestation.status).toBe("VOID");
    expect(cell.attestation.voidReason).toBe("VOID_NO_INOTIFY");
    expect(report.trialsRun).toBe(1);
    expect(JSON.stringify(report)).toContain('"trialsRun":1');
  });

  it("stops at a later VOID trial and does not start the trials after it", async () => {
    const k = 3;
    const seen: number[] = [];
    let started = 0;
    const inner = new MockTransport();
    const transport: Transport = {
      mode: "mock",
      start: async (request) => {
        started += 1;
        return inner.start(request);
      },
    };
    const inotifyBin = await fakeInotifywait();
    const cell = await withInotifyRequired(() =>
      runCell({
        scenario: s1,
        version: "1.0.80",
        fixture: loadKnownAnswerFixture(),
        buildDir,
        policy: "reject_once",
        transport,
        trials: 5,
        inotifyBin,
        inotifyReady: (trialIndex) => {
          seen.push(trialIndex);
          return trialIndex < k - 1;
        },
      }),
    );
    expect(cell.kind).toBe("ran");
    if (cell.kind !== "ran") return;
    const report = toReportCell(cell, { licensed: true });
    console.log(
      `EARLY_STOP later VOID k=${k} trialsRun=${cell.trialsRun} started=${started} cell=${cell.cell} indices=${seen.join(",")} jsonTrialsRun=${report.trialsRun}`,
    );
    expect(seen).toEqual([0, 1, 2]);
    expect(started).toBe(k - 1);
    expect(cell.trials).toHaveLength(k);
    expect(cell.trialsRun).toBe(k);
    expect(cell.trials.slice(0, k - 1).every((trial) => trial.verdict !== "VOID")).toBe(true);
    expect(cell.trials[k - 1]?.verdict).toBe("VOID");
    expect(cell.cell).toBe("VOID");
    expect(cell.scored).toBe(false);
    expect(cell.attestation.status).toBe("VOID");
    expect(report.trialsRun).toBe(k);
    expect(JSON.stringify(report)).toContain(`"trialsRun":${k}`);
  });

  it("does not let inotifyReady force the gate open when inotifywait is absent", async () => {
    let started = 0;
    const transport: Transport = {
      mode: "mock",
      start: async () => {
        started += 1;
        throw new Error("session must not start");
      },
    };
    const cell = await withInotifyRequired(() =>
      runCell({
        scenario: s1,
        version: "1.0.80",
        fixture: loadKnownAnswerFixture(),
        buildDir,
        policy: "reject_once",
        transport,
        inotifyBin: missingInotify,
        inotifyReady: () => true,
        trials: 5,
      }),
    );
    expect(cell.kind).toBe("ran");
    if (cell.kind !== "ran") return;
    console.log(
      `NARROW_ONLY verdict=${cell.trials[0]?.verdict} reason=${cell.trials[0]?.reasonCodes.join(",")} started=${started} scored=${cell.scored} trialsRun=${cell.trialsRun}`,
    );
    expect(cell.trials[0]?.verdict).toBe("VOID");
    expect(cell.trials[0]?.reasonCodes).toEqual(["VOID_NO_INOTIFY"]);
    expect(started).toBe(0);
    expect(cell.scored).toBe(false);
    expect(cell.cell).toBe("VOID");
    expect(cell.trialsRun).toBe(1);
  });

  it("omits trialsRun from a known-answer cell that is not VOID", () => {
    const cell = {
      kind: "ran",
      scenario: "S1",
      version: "1.0.80",
      cell: "GATED",
      scored: true,
      trialsRun: 5,
      trials: [{ verdict: "GATED", reasonCodes: [], coverageClocks: ["fs.watch"] }],
      attestation: {
        status: "OK",
        requestedVersion: "1.0.80",
        cliVersion: "1.0.80",
        sessionCopilotVersion: "1.0.80",
        buildDirSha256: "abc",
      },
    } as unknown as CellResult;
    const plain = toReportCell(cell);
    const licensed = toReportCell(cell, { licensed: true });
    expect(plain.trialsRun).toBeUndefined();
    expect(JSON.stringify(plain)).not.toContain("trialsRun");
    expect(licensed.trialsRun).toBe(5);
    expect(JSON.stringify(licensed)).toContain('"trialsRun":5');
  });
});
