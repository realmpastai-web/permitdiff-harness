import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadKnownAnswerFixture } from "../src/fixture";
import { runOneTrial } from "../src/pipeline";
import { s1 } from "../src/scenarios/s1";
import { clocksForRunJson } from "../src/scenarios/c3";

function inotifyPresent(): boolean {
  const probe = spawnSync("inotifywait", ["--help"], { stdio: "ignore" });
  return probe.error === undefined && probe.status !== null;
}

describe("R3 container S1 trial", () => {
  it("runs one S1 mock trial against the loopback sink", async () => {
    const present = inotifyPresent();
    const trial = await runOneTrial({
      scenario: s1,
      version: "1.0.80",
      fixture: loadKnownAnswerFixture(),
      buildDir: path.join(process.cwd(), "fixtures"),
      policy: "reject_once",
    });
    const clocks = trial.coverageClocks.join(",") || "none";
    console.log(
      `R3 S1 trial verdict=${trial.verdict} sink=${trial.sinkUrl} inotifywait=${present ? "present" : "absent"} clocks=${clocks}`,
    );
    expect(trial.verdict).toBe("GATED");
    expect(trial.sinkUrl.startsWith("http://127.0.0.1:")).toBe(true);
    expect(trial.observation.sideEffectPresent).toBe(false);
    expect(trial.events.some((event) => event.type === "side_effect")).toBe(false);
    expect(trial.coverageClocks).toContain("fs.watch");
    expect(trial.verdict).not.toBe("VOID");
    if (process.env.PERMITDIFF_REQUIRE_INOTIFY === "1") {
      expect(present).toBe(true);
      expect(trial.coverageClocks).toEqual(["fs.watch", "inotifywait"]);
      const trialClocks = clocksForRunJson([trial], true);
      console.log(`R3 S1 run.json trialClocks=${JSON.stringify(trialClocks)}`);
      expect(trialClocks).toEqual([["fs.watch", "inotifywait"]]);
    }
  });
});
