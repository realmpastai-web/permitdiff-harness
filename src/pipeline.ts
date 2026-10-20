import { attest, type Attestation } from "./attest";
import {
  classifyCell,
  classifyTrial,
  TRIALS_PER_CELL,
  type ClientPolicy,
  type TrialObservation,
  type Verdict,
} from "./classify";
import type { Snapshot } from "./effects";
import type { Fixture } from "./fixture";
import { createIsolation, readCanaryState, type CanaryState, type IsolationEnv, type SinkHit } from "./isolation";
import type { TrialEvent } from "./mock/fakeAcp";
import type { ScenarioDef } from "./scenarios/types";
import { MockTransport, type Transport } from "./transport";

export interface TrialRun {
  verdict: Verdict;
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

export function approvalPromptBeforeEffect(events: readonly TrialEvent[], sideEffectPresent: boolean): boolean {
  const prompt = events.find((event) => event.type === "approval_prompt");
  if (!prompt) return false;
  if (!sideEffectPresent) return true;
  const effect = events.find((event) => event.type === "side_effect");
  return !!effect && prompt.at < effect.at;
}

export function observationFrom(events: readonly TrialEvent[], sideEffectPresent: boolean): TrialObservation {
  const request = events.find((event) => event.type === "permission_request");
  const effect = events.find((event) => event.type === "side_effect");
  return {
    toolCallUpdateSeen: events.some((event) => event.type === "tool_call"),
    permissionRequestSeen: !!request,
    permissionRequestBeforeSideEffect: !!request && (!sideEffectPresent || (!!effect && request.at < effect.at)),
    sideEffectPresent,
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
  try {
    const canaryBefore = await readCanaryState(iso);
    const result = await transport.execute({
      scenario: opts.scenario,
      version: opts.version,
      fixture: opts.fixture,
      policy,
      sessionCopilotVersion: opts.sessionCopilotVersion ?? opts.version,
      isolation: iso,
    });
    const canaryAfter = await readCanaryState(iso);
    const observation = observationFrom(result.events, result.sideEffectPresent);
    return {
      verdict: classifyTrial(observation),
      observation,
      events: result.events,
      sideEffectPresent: result.sideEffectPresent,
      approvalPromptBeforeEffect: approvalPromptBeforeEffect(result.events, result.sideEffectPresent),
      cliVersion: result.cliVersion,
      sessionCopilotVersion: result.sessionCopilotVersion,
      canaryBefore,
      canaryAfter,
      snapshot: result.snapshot,
      sinkHits: iso.sink.hits.map((hit) => ({ ...hit })),
      sinkUrl: iso.sink.url,
      copilotHome: iso.copilotHome,
      copilotCacheHome: iso.copilotCacheHome,
      workdir: iso.workdir,
      env: { ...iso.env },
      cliArgs: [...iso.cliArgs, ...opts.scenario.extraCliArgs],
    };
  } finally {
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
