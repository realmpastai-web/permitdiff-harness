import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyCell } from "../src/classify";
import { loadKnownAnswerFixture } from "../src/fixture";
import { runCell, runOneTrial, type CellResult } from "../src/pipeline";
import { s1 } from "../src/scenarios/s1";
import { clocksForRunJson, toReportCell } from "../src/scenarios/c3";
import { RealCliTransport, type Transport, type TransportRequest } from "../src/transport";

const buildDir = path.join(process.cwd(), "fixtures");
const missingInotify = path.join(buildDir, "missing-inotifywait");

function withInotifyRequired<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.PERMITDIFF_REQUIRE_INOTIFY;
  process.env.PERMITDIFF_REQUIRE_INOTIFY = "1";
  return run().finally(() => {
    if (previous === undefined) delete process.env.PERMITDIFF_REQUIRE_INOTIFY;
    else process.env.PERMITDIFF_REQUIRE_INOTIFY = previous;
  });
}

describe("Amendment 2 inotify fail-closed", () => {
  it("records VOID and does not start the session when inotifywait is required but not ready", async () => {
    let started = 0;
    const transport: Transport = {
      mode: "mock",
      start: async () => {
        started += 1;
        throw new Error("session must not start");
      },
    };
    const trial = await withInotifyRequired(() =>
      runOneTrial({
        scenario: s1,
        version: "1.0.80",
        fixture: loadKnownAnswerFixture(),
        buildDir,
        policy: "reject_once",
        transport,
        inotifyBin: missingInotify,
      }),
    );
    const cell = await withInotifyRequired(() =>
      runCell({
        scenario: s1,
        version: "1.0.80",
        fixture: loadKnownAnswerFixture(),
        buildDir,
        policy: "reject_once",
        transport,
        inotifyBin: missingInotify,
        trials: 1,
      }),
    );
    console.log(
      `VOID_NO_INOTIFY verdict=${trial.verdict} reason=${trial.reasonCodes.join(",")} started=${started} cell=${cell.kind === "ran" ? cell.cell : cell.kind} scored=${cell.kind === "ran" ? cell.scored : false}`,
    );
    expect(started).toBe(0);
    expect(trial.verdict).toBe("VOID");
    expect(trial.reasonCodes).toEqual(["VOID_NO_INOTIFY"]);
    expect(trial.coverageClocks).not.toContain("inotifywait");
    expect(trial.events).toEqual([]);
    expect(cell.kind).toBe("ran");
    if (cell.kind !== "ran") return;
    expect(cell.cell).toBe("VOID");
    expect(cell.scored).toBe(false);
    expect(cell.attestation.status).toBe("VOID");
    expect(cell.attestation.voidReason).toBe("VOID_NO_INOTIFY");
    expect(classifyCell(["VOID", "VOID", "VOID", "VOID", "VOID"])).toBe("VOID");
  });

  it("does not call RealCliTransport.start when inotifywait is not ready", async () => {
    let started = 0;
    const real = new RealCliTransport();
    const transport: Transport = {
      mode: "real",
      start: (request) => {
        started += 1;
        return real.start(request);
      },
    };
    const trial = await runOneTrial({
      scenario: s1,
      version: "1.0.80",
      fixture: loadKnownAnswerFixture(),
      buildDir,
      policy: "reject_once",
      transport,
      inotifyBin: missingInotify,
    });
    expect(started).toBe(0);
    expect(trial.verdict).toBe("VOID");
    expect(trial.reasonCodes).toEqual(["VOID_NO_INOTIFY"]);
    await expect(real.start({ coverageClocks: ["fs.watch"] } as unknown as TransportRequest)).rejects.toThrow(
      "VOID_NO_INOTIFY",
    );
  });

  it("writes per-trial clocks into the licensed run.json shape when both clocks are present", () => {
    const clocks = ["fs.watch", "inotifywait"] as const;
    const cell = {
      kind: "ran",
      scenario: "S1",
      version: "1.0.80",
      cell: "GATED",
      scored: true,
      trials: [{ verdict: "GATED", reasonCodes: [], coverageClocks: clocks }],
      attestation: {
        status: "OK",
        requestedVersion: "1.0.80",
        cliVersion: "1.0.80",
        sessionCopilotVersion: "1.0.80",
        buildDirSha256: "abc",
      },
    } as unknown as CellResult;
    const licensed = toReportCell(cell, { licensed: true });
    const plain = toReportCell(cell);
    const json = JSON.stringify(licensed);
    console.log(`LICENSED run.json trialClocks=${JSON.stringify(licensed.trialClocks)}`);
    expect(clocksForRunJson([{ coverageClocks: clocks }], true)).toEqual([["fs.watch", "inotifywait"]]);
    expect(licensed.trialClocks).toEqual([["fs.watch", "inotifywait"]]);
    expect(json).toContain('"trialClocks":[["fs.watch","inotifywait"]]');
    expect(plain.trialClocks).toBeUndefined();
    expect(JSON.stringify(plain)).not.toContain("trialClocks");
  });
});
