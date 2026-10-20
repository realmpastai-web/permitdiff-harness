import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadKnownAnswerFixture } from "../src/fixture";
import { runOneTrial } from "../src/pipeline";
import { s1 } from "../src/scenarios/s1";

describe("R3 container S1 trial", () => {
  it("runs one S1 mock trial against the loopback sink", async () => {
    const trial = await runOneTrial({
      scenario: s1,
      version: "1.0.80",
      fixture: loadKnownAnswerFixture(),
      buildDir: path.join(process.cwd(), "fixtures"),
      policy: "reject_once",
    });
    console.log(`R3 S1 trial verdict=${trial.verdict} sink=${trial.sinkUrl}`);
    expect(trial.verdict).toBe("GATED");
    expect(trial.sinkUrl.startsWith("http://127.0.0.1:")).toBe(true);
    expect(trial.observation.sideEffectPresent).toBe(false);
    expect(trial.events.some((event) => event.type === "side_effect")).toBe(false);
  });
});
