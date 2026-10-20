import { attest, type Attestation } from "./attest";
import {
  classifyCell,
  classifyTrial,
  trialReasonCodes,
  TRIALS_PER_CELL,
  type ClientPolicy,
  type TrialObservation,
  type TrialReasonCode,
  type Verdict,
} from "./classify";
import type { Snapshot } from "./effects";
import type { Fixture } from "./fixture";
import { createIsolation, readCanaryState, type CanaryState, type IsolationEnv, type SinkHit } from "./isolation";
import type { TrialEvent } from "./mock/fakeAcp";
import type { ScenarioDef } from "./scenarios/types";
import { MockTransport, type Transport } from "./transport";
import { SideEffectWatcher, type CoverageClock, type WatchRecord } from "./watcher";

export interface TrialRun {
  verdict: Verdict;
  reasonCodes: TrialReasonCode[];
  coverageClocks: CoverageClock[];
  observation: TrialObservation;
  events: TrialEvent[];
  sideEffectPresent: boolean;
  approvalPromptBeforeEffect: boolean;
  cliVersion: string;
  sessionCopilotVersion: string;
  canaryBefore: CanaryState;
  canaryAfter: CanaryState;
  snapshot: Snapshot;
  sinkHits: SinkHit[];
  watch: WatchRecord[];
  sideEffectAt?: number;
  sinkUrl: string;
  copilotHome: string;
  copilotCacheHome: string;
  workdir: string;
  env: IsolationEnv;
  cliArgs: string[];
}

export type CellResult =
  | {
      kind: "skipped";
      scenario: string;
      version: string;
      skipReason: string;
      scored: false;
    }
  | {
      kind: "ran";
      scenario: string;
      version: string;
      trials: TrialRun[];
      cell: Verdict;
      scored: boolean;
      attestation: Attestation;
    };

export function approvalPromptBeforeEffect(events: readonly TrialEvent[], sideEffectAt: number | undefined): boolean {
  const prompt = events.find((event) => event.type === "approval_prompt");
  if (!prompt) return false;
  if (sideEffectAt === undefined) return true;
  return prompt.at < sideEffectAt;
}

export function earliestSideEffectAt(times: readonly number[]): number | undefined {
  if (times.length === 0) return undefined;
  return Math.min(...times);
}

export function observationFrom(
  events: readonly TrialEvent[],
  sideEffectAt: number | undefined,
  watcherCoverageAttested: boolean,
): TrialObservation {
  const request = events.find((event) => event.type === "permission_request");
  const sideEffectPresent = sideEffectAt !== undefined;
  return {
    toolCallUpdateSeen: events.some((event) => event.type === "tool_call"),
    permissionRequestSeen: !!request,
    permissionRequestBeforeSideEffect: !!request && (sideEffectAt === undefined || request.at < sideEffectAt),
    sideEffectPresent,
    watcherCoverageAttested,
  };
}

export interface RunOptions {
  scenario: ScenarioDef;
  version: string;
  fixture: Fixture;
  buildDir: string;
  policy?: ClientPolicy;
  sessionCopilotVersion?: string;
  observedCliVersion?: string;
  recordedBuildDirSha256?: string;
  allowRequiresRealCli?: boolean;
  trials?: number;
  transport?: Transport;
}

export async function runOneTrial(opts: RunOptions): Promise<TrialRun> {
  const policy = opts.policy ?? "reject_once";
  const transport = opts.transport ?? new MockTransport();
  if (transport.mode !== "mock") {
    throw new Error("CI refuses a non-mock transport");
  }
  const iso = await createIsolation(opts.version);
  const watcher = new SideEffectWatcher([iso.workdir, iso.home]);
  await watcher.start();
  try {
    const canaryBefore = await readCanaryState(iso);
    const hitsBefore = iso.sink.hits.length;
    const result = await transport.execute({
      scenario: opts.scenario,
      version: opts.version,
      fixture: opts.fixture,
      policy,
      sessionCopilotVersion: opts.sessionCopilotVersion ?? opts.version,
      isolation: iso,
    });
    await watcher.close();
    const canaryAfter = await readCanaryState(iso);
    const sinkHits = iso.sink.hits.slice(hitsBefore).map((hit) => ({ ...hit }));
    const sideEffectAt = earliestSideEffectAt([
      ...watcher.records.map((record) => record.at),
      ...sinkHits.map((hit) => hit.at),
    ]);
    const observation = observationFrom(result.events, sideEffectAt, watcher.coverageAttested);
    const coverageClocks = watcher.coverageClocks;
    const reasonCodes = trialReasonCodes(observation);
    console.log(
      `COVERAGE_CLOCKS scenario=${opts.scenario.id} version=${opts.version} clocks=${coverageClocks.length === 0 ? "none" : coverageClocks.join(",")}`,
    );
    return {
      verdict: classifyTrial(observation),
      reasonCodes,
      coverageClocks,
      observation,
      events: result.events,
      sideEffectPresent: observation.sideEffectPresent,
      approvalPromptBeforeEffect: approvalPromptBeforeEffect(result.events, sideEffectAt),
      cliVersion: result.cliVersion,
      sessionCopilotVersion: result.sessionCopilotVersion,
      canaryBefore,
      canaryAfter,
      snapshot: result.snapshot,
      sinkHits,
      watch: watcher.records.map((record) => ({ ...record })),
      ...(sideEffectAt === undefined ? {} : { sideEffectAt }),
      sinkUrl: iso.sink.url,
      copilotHome: iso.copilotHome,
      copilotCacheHome: iso.copilotCacheHome,
      workdir: iso.workdir,
      env: { ...iso.env },
      cliArgs: [...iso.cliArgs, ...opts.scenario.extraCliArgs],
    };
  } finally {
    await watcher.close();
    await iso.close();
  }
}

export async function runCell(opts: RunOptions): Promise<CellResult> {
  if (opts.scenario.requiresRealCli && !opts.allowRequiresRealCli) {
    return {
      kind: "skipped",
      scenario: opts.scenario.id,
      version: opts.version,
      skipReason: opts.scenario.skipReason ?? "requires real CLI",
      scored: false,
    };
  }
  const count = opts.trials ?? TRIALS_PER_CELL;
  const trials: TrialRun[] = [];
  for (let i = 0; i < count; i += 1) {
    trials.push(await runOneTrial(opts));
  }
  const cell = classifyCell(trials.map((trial) => trial.verdict));
  const sessions = new Set(trials.map((trial) => trial.sessionCopilotVersion));
  const sessionCopilotVersion = sessions.size === 1 ? trials[0].sessionCopilotVersion : "MISMATCH";
  const attestation = attest({
    requestedVersion: opts.version,
    cliVersion: opts.observedCliVersion ?? trials[0].cliVersion,
    sessionCopilotVersion,
    executedBuildDir: opts.buildDir,
    recordedBuildDirSha256: opts.recordedBuildDirSha256,
  });
  return {
    kind: "ran",
    scenario: opts.scenario.id,
    version: opts.version,
    trials,
    cell,
    scored: attestation.status === "OK",
    attestation,
  };
}

export function scoredCells(cells: readonly CellResult[]): Array<{ scenario: string; version: string; cell: Verdict }> {
  const scored = [];
  for (const cell of cells) {
    if (cell.kind === "ran" && cell.scored) {
      scored.push({ scenario: cell.scenario, version: cell.version, cell: cell.cell });
    }
  }
  return scored;
}
