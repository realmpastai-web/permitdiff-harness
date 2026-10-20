import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Fixture } from "../src/fixture";
import { loadKnownAnswerFixture } from "../src/fixture";
import { runCell, runOneTrial } from "../src/pipeline";
import { ciSweep, scenarios, skippedInCi } from "../src/scenarios";
import { s1 } from "../src/scenarios/s1";
import { s10 } from "../src/scenarios/s10";
import { s11 } from "../src/scenarios/s11";
import { s12 } from "../src/scenarios/s12";
import { s2 } from "../src/scenarios/s2";
import { s4 } from "../src/scenarios/s4";
import { s5 } from "../src/scenarios/s5";
import { s6 } from "../src/scenarios/s6";
import { s7 } from "../src/scenarios/s7";
import { s8 } from "../src/scenarios/s8";
import { s9 } from "../src/scenarios/s9";

const buildDir = path.join(process.cwd(), "fixtures");

describe("scenario sweep", () => {
  it("skips S6, S7, and S8 in CI with a reason", () => {
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
      "S9",
      "S10",
      "S11",
      "S12",
    ]);
    const skipped = skippedInCi();
    expect(skipped.map((scenario) => scenario.id)).toEqual(["S6", "S7", "S8"]);
    for (const scenario of skipped) {
      expect(scenario.requiresRealCli).toBe(true);
      expect(scenario.skipReason?.startsWith("skipped in CI:")).toBe(true);
    }
    expect(ciSweep().map((scenario) => scenario.id)).toEqual(["S1", "S2", "S3", "S4", "S5", "S9", "S10", "S11", "S12"]);
    expect(s5.extraCliArgs).toEqual(["-p"]);
    expect(s5.extraCliArgs.join(" ")).not.toMatch(/allow|yolo/);
    expect(s6.rawInput({ root: "", workdir: "", home: "", sinkUrl: "", addDir: "", sandboxDir: "" }).managedSetting).toBe(
      "disableBypassPermissionsMode",
    );
  });

  it("does not run requiresRealCli scenarios unless the caller opts in", async () => {
    const skipped = await runCell({
      scenario: s7,
      version: "1.0.81-5",
      fixture: loadKnownAnswerFixture(),
      buildDir,
    });
    expect(skipped).toMatchObject({ kind: "skipped", scenario: "S7", scored: false });
    if (skipped.kind === "skipped") expect(skipped.skipReason).toContain("pty");
  });

  it("runs the fake-transport side effects for scenarios that CI does not skip", async () => {
    const fixture = loadKnownAnswerFixture();
    const version = "smoke";
    const base = { fixture, buildDir, version };

    const touch = await runOneTrial({ ...base, scenario: s1 });
    expect(touch.snapshot.touched).toBe(true);
    expect(touch.verdict).toBe("UNGATED");

    const outside = await runOneTrial({ ...base, scenario: s2 });
    expect(outside.snapshot.homeCanary).toBe(true);
    expect(outside.snapshot.homeCanary && outside.workdir !== outside.copilotHome).toBe(true);

    const removed = await runOneTrial({ ...base, scenario: s4 });
    expect(removed.snapshot.removeCanaryExists).toBe(false);
    expect(removed.canaryAfter.keep).toBe(removed.canaryBefore.keep);

    const flags = await runOneTrial({ ...base, scenario: s5 });
    expect(flags.cliArgs).toContain("-p");
    expect(flags.snapshot.touched).toBe(true);
    expect(flags.snapshot.removeCanaryExists).toBe(false);
    expect(flags.canaryAfter.keep).toBe(flags.canaryBefore.keep);

    const deleted = await runOneTrial({ ...base, scenario: s9 });
    expect(deleted.snapshot.outsideExists).toBe(false);
    expect(deleted.snapshot.insideAddDirExists).toBe(true);

    const hook = await runOneTrial({ ...base, scenario: s10 });
    expect(hook.snapshot.hookAskExists).toBe(true);
    const hookInput = hook.events.find((event) => event.type === "tool_call")?.detail?.rawInput as {
      hookResult?: string;
    };
    expect(hookInput.hookResult).toBe("ask");

    const parallel = await runOneTrial({ ...base, scenario: s11 });
    expect(parallel.snapshot.parallelA).toBe(true);
    expect(parallel.snapshot.parallelB).toBe(true);
    expect(parallel.events.filter((event) => event.type === "tool_call")).toHaveLength(2);

    const sandbox = await runOneTrial({ ...base, scenario: s12 });
    expect(sandbox.snapshot.outsideSandbox).toBe(true);
    expect(sandbox.snapshot.insideSandbox).toBe(false);
    expect(sandbox.cliArgs).toEqual(expect.arrayContaining(["--acp", "--sandbox"]));
  });

  it("emits no tool_call when the fixture says INCONCLUSIVE", async () => {
    const fixture: Fixture = {
      issue: "unit",
      note: "no tool call",
      cells: [{ scenario: "S1", version: "0.0.0", verdict: "INCONCLUSIVE" }],
    };
    const trial = await runOneTrial({ scenario: s1, version: "0.0.0", fixture, buildDir });
    expect(trial.verdict).toBe("INCONCLUSIVE");
    expect(trial.observation.toolCallUpdateSeen).toBe(false);
    expect(trial.sideEffectPresent).toBe(false);
  });

  it("keeps S8's git effect on the fake transport and out of the CI sweep", () => {
    expect(s8.effect).toBe("git-push-bare");
    expect(ciSweep().some((scenario) => scenario.id === "S8")).toBe(false);
    expect(s7.requiresRealCli).toBe(true);
    expect(s6.requiresRealCli).toBe(true);
  });
});
