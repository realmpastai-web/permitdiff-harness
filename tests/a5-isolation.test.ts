import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadKnownAnswerFixture } from "../src/fixture";
import { CANARY_BODY, createIsolation, readCanaryState } from "../src/isolation";
import { runOneTrial } from "../src/pipeline";
import { s3 } from "../src/scenarios/s3";

describe("A5 isolation", () => {
  it("gives each run fresh homes, a fresh workdir, canaries, and records an S3 sink hit", async () => {
    const first = await createIsolation("1.0.80");
    const second = await createIsolation("1.0.81-5");
    const firstHome = first.copilotHome;
    const firstCache = first.copilotCacheHome;
    const firstWork = first.workdir;
    try {
      expect(first.copilotHome).not.toBe(second.copilotHome);
      expect(first.copilotCacheHome).not.toBe(second.copilotCacheHome);
      expect(first.workdir).not.toBe(second.workdir);
      expect(first.home).not.toBe(first.workdir);
      expect(first.env).toEqual({
        COPILOT_HOME: first.copilotHome,
        COPILOT_CACHE_HOME: first.copilotCacheHome,
        COPILOT_AUTO_UPDATE: "false",
        HOME: first.home,
      });
      expect(second.env.COPILOT_AUTO_UPDATE).toBe("false");
      expect(first.cliArgs).toEqual(["--no-auto-update", "--prefer-version", "1.0.80"]);
      expect(second.cliArgs).toContain("--prefer-version");
      expect(second.cliArgs).toContain("1.0.81-5");
      const canaries = await readCanaryState(first);
      expect(canaries.keep).toBe(CANARY_BODY);
      expect(canaries.removeExists).toBe(true);
      expect(first.sink.url.startsWith("http://127.0.0.1:")).toBe(true);
    } finally {
      await first.close();
      await second.close();
    }

    const trial = await runOneTrial({
      scenario: s3,
      version: "smoke",
      fixture: loadKnownAnswerFixture(),
      buildDir: path.join(process.cwd(), "fixtures"),
    });
    expect(trial.copilotHome).not.toBe(firstHome);
    expect(trial.copilotCacheHome).not.toBe(firstCache);
    expect(trial.workdir).not.toBe(firstWork);
    expect(trial.env.COPILOT_AUTO_UPDATE).toBe("false");
    expect(trial.cliArgs.slice(0, 3)).toEqual(["--no-auto-update", "--prefer-version", "smoke"]);
    expect(trial.canaryBefore).toEqual({ keep: CANARY_BODY, removeExists: true });
    expect(trial.canaryAfter).toEqual({ keep: CANARY_BODY, removeExists: true });
    expect(trial.sinkUrl.startsWith("http://127.0.0.1:")).toBe(true);
    expect(trial.sinkHits.length).toBeGreaterThan(0);
    expect(trial.sinkHits[0]?.url).toBe("/sink");
    expect(["127.0.0.1", "::ffff:127.0.0.1"]).toContain(trial.sinkHits[0]?.remoteAddress);
    expect(trial.sideEffectPresent).toBe(true);
    expect(trial.verdict).toBe("UNGATED");
  });
});
