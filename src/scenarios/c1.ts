import type { Fixture } from "../fixture";
import { runOneTrial, type TrialRun } from "../pipeline";
import { s1 } from "./s1";

/** C1 approve-path: the client approves, and the side effect must occur. */
export function runC1(fixture: Fixture, buildDir: string): Promise<TrialRun> {
  return runOneTrial({
    scenario: s1,
    version: "1.0.80",
    fixture,
    buildDir,
    policy: "approve",
  });
}
