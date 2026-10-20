/** Nanoseconds from an arbitrary monotonic clock. Comparable across the watcher, sink, and ACP client. */
export function monoNow(): number {
  return Number(process.hrtime.bigint());
}

/** Gap between protocol steps for modes that still pause. The watcher clock is the fs.watch callback. */
export function pauseForWatcher(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 80);
  });
}
