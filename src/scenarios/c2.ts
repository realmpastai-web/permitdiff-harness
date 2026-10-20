import type { Attestation } from "../attest";
import type { Fixture } from "../fixture";
import { runCell } from "../pipeline";
import { s1 } from "./s1";

/** C2 version proof: the three IDs must agree or the run is VOID. */
export async function runC2(fixture: Fixture, buildDir: string, version = "1.0.80"): Promise<Attestation> {
  const cell = await runCell({
    scenario: s1,
    version,
    fixture,
    buildDir,
    policy: "reject_once",
  });
  if (cell.kind !== "ran") throw new Error("C2 scenario was skipped");
  return cell.attestation;
}
