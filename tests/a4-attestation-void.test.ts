import path from "node:path";
import { describe, expect, it } from "vitest";
import { attest } from "../src/attest";
import { sha256Dir } from "../src/hash";
import { loadKnownAnswerFixture } from "../src/fixture";
import { runCell, scoredCells } from "../src/pipeline";
import { s1 } from "../src/scenarios/s1";

const buildDir = path.join(process.cwd(), "fixtures");

describe("A4 attestation void", () => {
  it("voids a run whose three IDs disagree and does not score it", async () => {
    const fixture = loadKnownAnswerFixture();
    const mismatched = await runCell({
      scenario: s1,
      version: "1.0.80",
      fixture,
      buildDir,
      sessionCopilotVersion: "1.0.81-5",
      policy: "reject_once",
    });
    expect(mismatched.kind).toBe("ran");
    if (mismatched.kind !== "ran") return;
    expect(mismatched.attestation.cliVersion).toBe("1.0.80");
    expect(mismatched.attestation.sessionCopilotVersion).toBe("1.0.81-5");
    expect(mismatched.attestation.status).toBe("VOID");
    expect(mismatched.attestation.voidReason).toContain("session.start copilotVersion !== V");
    expect(mismatched.attestation.voidReason).toContain("copilot --version !== session.start copilotVersion");
    expect(mismatched.scored).toBe(false);
    expect(scoredCells([mismatched])).toEqual([]);

    const badHash = await runCell({
      scenario: s1,
      version: "1.0.80",
      fixture,
      buildDir,
      recordedBuildDirSha256: "0".repeat(64),
      policy: "reject_once",
    });
    expect(badHash.kind).toBe("ran");
    if (badHash.kind !== "ran") return;
    expect(badHash.attestation.status).toBe("VOID");
    expect(badHash.attestation.voidReason).toContain("recorded build-dir sha256 does not match");
    expect(badHash.scored).toBe(false);
    expect(scoredCells([badHash])).toEqual([]);
  });

  it("records a matching build-dir sha256 when the three IDs agree", () => {
    const hash = sha256Dir(buildDir);
    const ok = attest({
      requestedVersion: "1.0.80",
      cliVersion: "1.0.80",
      sessionCopilotVersion: "1.0.80",
      executedBuildDir: buildDir,
    });
    expect(ok.status).toBe("OK");
    expect(ok.buildDirSha256).toBe(hash);

    const missing = attest({
      requestedVersion: "1.0.80",
      cliVersion: "1.0.80",
      sessionCopilotVersion: "1.0.80",
      executedBuildDir: buildDir,
      recordedBuildDirSha256: "",
    });
    expect(missing.status).toBe("VOID");
    expect(missing.voidReason).toContain("not recorded");
  });
});
