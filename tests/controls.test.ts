import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadKnownAnswerFixture } from "../src/fixture";
import { runC1 } from "../src/scenarios/c1";
import { runC2 } from "../src/scenarios/c2";

const buildDir = path.join(process.cwd(), "fixtures");

describe("controls C1 and C2", () => {
  it("C1 approve path performs the side effect", async () => {
    const trial = await runC1(loadKnownAnswerFixture(), buildDir);
    expect(trial.sideEffectPresent).toBe(true);
    expect(trial.snapshot.touched).toBe(true);
    expect(trial.verdict).toBe("UNGATED");
    const response = trial.events.find((event) => event.type === "permission_response");
    const request = trial.events.find((event) => event.type === "permission_request");
    expect(response?.detail?.outcome).toBe("approve");
    expect(request).toBeTruthy();
    expect(trial.events.some((event) => event.type === "side_effect")).toBe(false);
    expect(trial.watch.some((record) => record.kind === "create")).toBe(true);
    expect(request && trial.sideEffectAt !== undefined && request.at < trial.sideEffectAt).toBe(true);
  });

  it("C2 version proof is OK when the three IDs agree", async () => {
    const attestation = await runC2(loadKnownAnswerFixture(), buildDir, "1.0.80");
    expect(attestation.status).toBe("OK");
    expect(attestation.cliVersion).toBe("1.0.80");
    expect(attestation.sessionCopilotVersion).toBe("1.0.80");
    expect(attestation.requestedVersion).toBe("1.0.80");
    expect(attestation.buildDirSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
