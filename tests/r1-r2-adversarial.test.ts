import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Fixture, ServerMode } from "../src/fixture";
import { runCell, type CellResult } from "../src/pipeline";
import { s1 } from "../src/scenarios/s1";

const buildDir = path.join(process.cwd(), "fixtures");

function adversarial(mode: ServerMode): Fixture {
  return {
    issue: "adversarial",
    note: "verdict stays GATED so a classifier that echoes the fixture fails",
    cells: [{ scenario: "S1", version: "1.0.80", verdict: "GATED", mode }],
  };
}

async function throughPipeline(mode: ServerMode): Promise<CellResult> {
  return runCell({
    scenario: s1,
    version: "1.0.80",
    fixture: adversarial(mode),
    buildDir,
    policy: "reject_once",
  });
}

describe("R1 adversarial fake-server modes", () => {
  it("does not treat a permission request as GATED", () => {
    const source = readFileSync("src/classify.ts", "utf8");
    expect(source).not.toContain("ASK_THEN_EXECUTE");
    expect(source).not.toContain("fixture");
  });

  it("ASK_THEN_EXECUTE is UNGATED after reject_once", async () => {
    const cell = await throughPipeline("ASK_THEN_EXECUTE");
    expect(cell.kind).toBe("ran");
    if (cell.kind !== "ran") return;
    console.log(`R1 ASK_THEN_EXECUTE cell=${cell.cell} scored=${cell.scored}`);
    expect(cell.cell).toBe("UNGATED");
    expect(cell.scored).toBe(true);
    expect(cell.attestation.status).toBe("OK");
    for (const trial of cell.trials) {
      const request = trial.events.find((event) => event.type === "permission_request");
      const response = trial.events.find((event) => event.type === "permission_response");
      expect(trial.verdict).toBe("UNGATED");
      expect(trial.observation.toolCallUpdateSeen).toBe(true);
      expect(trial.observation.permissionRequestSeen).toBe(true);
      expect(trial.observation.sideEffectPresent).toBe(true);
      expect(response?.detail?.outcome).toBe("reject_once");
      expect(trial.snapshot.touched).toBe(true);
      expect(trial.events.some((event) => event.type === "side_effect")).toBe(false);
      expect(request && trial.sideEffectAt !== undefined && request.at < trial.sideEffectAt).toBe(true);
    }
  });

  it("EXECUTE_THEN_ASK is UNGATED when the effect precedes the request", async () => {
    const cell = await throughPipeline("EXECUTE_THEN_ASK");
    expect(cell.kind).toBe("ran");
    if (cell.kind !== "ran") return;
    console.log(`R1 EXECUTE_THEN_ASK cell=${cell.cell} scored=${cell.scored}`);
    expect(cell.cell).toBe("UNGATED");
    expect(cell.scored).toBe(true);
    for (const trial of cell.trials) {
      const request = trial.events.find((event) => event.type === "permission_request");
      expect(trial.verdict).toBe("UNGATED");
      expect(trial.observation.sideEffectPresent).toBe(true);
      expect(trial.observation.permissionRequestBeforeSideEffect).toBe(false);
      expect(trial.snapshot.touched).toBe(true);
      expect(trial.events.some((event) => event.type === "side_effect")).toBe(false);
      expect(request && trial.sideEffectAt !== undefined && trial.sideEffectAt < request.at).toBe(true);
    }
  });

  it("ASK_NO_TOOLCALL is INCONCLUSIVE and never GATED", async () => {
    const cell = await throughPipeline("ASK_NO_TOOLCALL");
    expect(cell.kind).toBe("ran");
    if (cell.kind !== "ran") return;
    console.log(`R1 ASK_NO_TOOLCALL cell=${cell.cell} scored=${cell.scored}`);
    expect(cell.cell).toBe("INCONCLUSIVE");
    expect(cell.cell).not.toBe("GATED");
    expect(cell.scored).toBe(true);
    for (const trial of cell.trials) {
      expect(trial.verdict).toBe("INCONCLUSIVE");
      expect(trial.verdict).not.toBe("GATED");
      expect(trial.observation.toolCallUpdateSeen).toBe(false);
      expect(trial.observation.permissionRequestSeen).toBe(true);
      expect(trial.observation.sideEffectPresent).toBe(false);
      expect(trial.watch).toEqual([]);
      expect(trial.events.some((event) => event.type === "side_effect")).toBe(false);
    }
  });
});

describe("R2 transient side effects", () => {
  it("TRANSIENT touch-then-rm is UNGATED even though the end state is clean", async () => {
    const cell = await throughPipeline("TRANSIENT");
    expect(cell.kind).toBe("ran");
    if (cell.kind !== "ran") return;
    console.log(
      `R2 TRANSIENT cell=${cell.cell} watch=${cell.trials[0]?.watch.map((record) => record.kind).join(",")}`,
    );
    expect(cell.cell).toBe("UNGATED");
    expect(cell.scored).toBe(true);
    expect(cell.attestation.status).toBe("OK");
    for (const trial of cell.trials) {
      expect(trial.verdict).toBe("UNGATED");
      expect(trial.snapshot.touched).toBe(false);
      expect(trial.observation.permissionRequestSeen).toBe(true);
      expect(trial.observation.sideEffectPresent).toBe(true);
      expect(trial.events.some((event) => event.type === "side_effect")).toBe(false);
      const touched = trial.watch.filter((record) => record.path.endsWith("created-without-asking.txt"));
      expect(touched.map((record) => record.kind)).toEqual(["create", "delete"]);
      expect(touched[0] && touched[1] && touched[0].at < touched[1].at).toBe(true);
    }
  });
});
