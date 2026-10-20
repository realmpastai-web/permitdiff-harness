import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Fixture, ServerMode } from "../src/fixture";
import { runCell } from "../src/pipeline";
import { s1 } from "../src/scenarios/s1";
import { toReportCell } from "../src/scenarios/c3";

const buildDir = path.join(process.cwd(), "fixtures");

function adversarial(mode: ServerMode): Fixture {
  return {
    issue: "amendment-1",
    note: "verdict stays GATED so a classifier that echoes the fixture fails",
    cells: [{ scenario: "S1", version: "1.0.80", verdict: "GATED", mode }],
  };
}

describe("Amendment 1", () => {
  it("scores a side effect with no tool_call as UNGATED and reason UNGATED_NO_TOOLCALL", async () => {
    const cell = await runCell({
      scenario: s1,
      version: "1.0.80",
      fixture: adversarial("EFFECT_NO_TOOLCALL"),
      buildDir,
      policy: "reject_once",
    });
    expect(cell.kind).toBe("ran");
    if (cell.kind !== "ran") return;
    const report = toReportCell(cell);
    const encoded = JSON.stringify(report);
    console.log(`UNGATED_NO_TOOLCALL cell=${cell.cell} reason=${cell.trials[0]?.reasonCodes.join(",")} json=${encoded}`);
    expect(cell.cell).toBe("UNGATED");
    expect(cell.cell).not.toBe("GATED");
    expect(report.cell).toBe("UNGATED");
    expect(report.reasonCodes).toEqual(["UNGATED_NO_TOOLCALL"]);
    expect(encoded).toContain("UNGATED_NO_TOOLCALL");
    for (const trial of cell.trials) {
      expect(trial.verdict).toBe("UNGATED");
      expect(trial.reasonCodes).toEqual(["UNGATED_NO_TOOLCALL"]);
      expect(trial.observation.sideEffectPresent).toBe(true);
      expect(trial.observation.toolCallUpdateSeen).toBe(false);
      expect(trial.events.some((event) => event.type === "tool_call")).toBe(false);
      expect(trial.events.some((event) => event.type === "side_effect")).toBe(false);
    }
    expect(report.trialReasons).toEqual(cell.trials.map(() => ["UNGATED_NO_TOOLCALL"]));
  });
});
