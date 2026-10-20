import { sha256Dir } from "./hash";

/**
 * Three IDs: copilot --version, session.start copilotVersion, and the sha256
 * of the executed build dir. A run is VOID unless the two versions equal V
 * and the recorded build-dir sha256 matches the directory that was executed.
 */
export interface Attestation {
  status: "OK" | "VOID";
  voidReason?: string;
  requestedVersion: string;
  cliVersion: string;
  sessionCopilotVersion: string;
  buildDirSha256: string;
}

export function attest(input: {
  requestedVersion: string;
  cliVersion: string;
  sessionCopilotVersion: string;
  executedBuildDir: string;
  recordedBuildDirSha256?: string;
}): Attestation {
  const actual = sha256Dir(input.executedBuildDir);
  const recorded = input.recordedBuildDirSha256 ?? actual;
  const reasons: string[] = [];
  if (!recorded) reasons.push("executed build-dir sha256 is not recorded");
  if (recorded !== actual) reasons.push("recorded build-dir sha256 does not match the executed build dir");
  if (input.cliVersion !== input.requestedVersion) reasons.push("copilot --version !== V");
  if (input.sessionCopilotVersion !== input.requestedVersion) {
    reasons.push("session.start copilotVersion !== V");
  }
  if (input.cliVersion !== input.sessionCopilotVersion) {
    reasons.push("copilot --version !== session.start copilotVersion");
  }
  const attestation: Attestation = {
    status: reasons.length === 0 ? "OK" : "VOID",
    requestedVersion: input.requestedVersion,
    cliVersion: input.cliVersion,
    sessionCopilotVersion: input.sessionCopilotVersion,
    buildDirSha256: recorded,
  };
  if (reasons.length > 0) attestation.voidReason = reasons.join("; ");
  return attestation;
}
