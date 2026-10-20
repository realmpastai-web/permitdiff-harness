/** Nanoseconds from an arbitrary monotonic clock. Comparable across the watcher, sink, and ACP client. */
export function monoNow(): number {
  return Number(process.hrtime.bigint());
}

/** Let inotify/poll observe a filesystem change before the next protocol step. */
export function pauseForWatcher(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 80);
  });
}
