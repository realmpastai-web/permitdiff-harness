import type { ClientPolicy } from "./classify";
import { captureSnapshot, runContext, sideEffectPresent, type RunContext, type Snapshot } from "./effects";
import type { Fixture } from "./fixture";
import { inotifyClockReady } from "./inotifyGate";
import type { Isolation } from "./isolation";
import { runMockSession, type TrialEvent } from "./mock/fakeAcp";
import { mockCopilotVersion } from "./mock/fakeCopilot";
import type { ScenarioDef } from "./scenarios/types";
import type { CoverageClock } from "./watcher";

/**
 * Transport is the single swap point for a later licensed run.
 * CI constructs MockTransport only. RealCliTransport is HELD and must not be called.
 */
export interface TransportRequest {
  scenario: ScenarioDef;
  version: string;
  fixture: Fixture;
  policy: ClientPolicy;
  sessionCopilotVersion: string;
  isolation: Isolation;
  coverageClocks: readonly CoverageClock[];
}

export interface TransportResult {
  events: TrialEvent[];
  sessionCopilotVersion: string;
  cliVersion: string;
  sideEffectPresent: boolean;
  snapshot: Snapshot;
  ctx: RunContext;
}

export interface Transport {
  readonly mode: "mock" | "real";
  /** Begins the session. The pipeline must not call this unless inotify is ready when required. */
  start(request: TransportRequest): Promise<TransportResult>;
}

export class MockTransport implements Transport {
  readonly mode = "mock" as const;

  async start(request: TransportRequest): Promise<TransportResult> {
    const ctx = runContext(request.isolation);
    const sinkBefore = request.isolation.sink.hits.length;
    const session = await runMockSession({
      copilotVersion: request.sessionCopilotVersion,
      fixture: request.fixture,
      scenario: request.scenario,
      version: request.version,
      ctx,
      policy: request.policy,
    });
    const snapshot = await captureSnapshot(ctx, request.isolation.sink.hits.length, request.scenario.effect);
    return {
      events: session.events,
      sessionCopilotVersion: session.sessionCopilotVersion,
      cliVersion: mockCopilotVersion(request.isolation.cliArgs),
      sideEffectPresent: sideEffectPresent(request.scenario.effect, snapshot, sinkBefore),
      snapshot,
      ctx,
    };
  }
}

export class RealCliTransport implements Transport {
  readonly mode = "real" as const;

  async start(request: TransportRequest): Promise<TransportResult> {
    if (!inotifyClockReady(request.coverageClocks)) {
      throw new Error("VOID_NO_INOTIFY");
    }
    // TODO(real-run): this is the only swap for a licensed run. Replace
    // MockTransport with RealCliTransport after Santhosh's approval, a Copilot
    // Business login, and credit-spend OK. Do not call this in CI. Do not
    // install or spawn a Copilot binary from this repository's CI.
    // A ready inotifywait does not enable the binary.
    throw new Error("HELD: real Copilot transport is not enabled");
  }
}
