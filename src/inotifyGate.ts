import type { CoverageClock } from "./watcher";

/** True for RealCliTransport and for any run that set PERMITDIFF_REQUIRE_INOTIFY=1. */
export function inotifyRequired(mode: "mock" | "real"): boolean {
  return mode === "real" || process.env.PERMITDIFF_REQUIRE_INOTIFY === "1";
}

export function inotifyClockReady(clocks: readonly CoverageClock[]): boolean {
  return clocks.includes("inotifywait");
}
