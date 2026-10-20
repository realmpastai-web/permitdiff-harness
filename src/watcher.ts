import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { statSync, watch, type FSWatcher, type Stats } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { recordSpawn } from "./audit";
import { monoNow } from "./time";

export interface WatchRecord {
  kind: "create" | "modify" | "delete";
  path: string;
  at: number;
}

export type CoverageClock = "fs.watch" | "inotifywait";

/** Same path and kind inside this window is one event seen by both clocks. Keep the earliest timestamp. */
const DEDUP_NS = 250_000_000;

let inotifyOnPath: boolean | undefined;

function inotifyAvailable(): boolean {
  if (inotifyOnPath !== undefined) return inotifyOnPath;
  const probe = spawnSync("inotifywait", ["--help"], { stdio: "ignore" });
  inotifyOnPath = probe.error === undefined && probe.status !== null;
  return inotifyOnPath;
}

/**
 * Records create, modify, and delete under the workdir and home (including
 * ~/canary). The timestamp is taken in the fs.watch callback, before stat.
 * inotifywait -m is merged in only when that binary is already on PATH.
 * A rescan is not the clock: it only backfills a file that is still present
 * or still missing when no event was recorded for it.
 */
export class SideEffectWatcher {
  readonly records: WatchRecord[] = [];
  private readonly signatures = new Map<string, string>();
  private readonly baseline = new Map<string, string>();
  private readonly known = new Set<string>();
  private readonly watchers: FSWatcher[] = [];
  private inotify: ChildProcess | undefined;
  private inotifyBuf = "";
  private fsArmed = false;
  private watchFailed = false;
  private inotifyReady = false;
  private closed = false;

  constructor(private readonly roots: readonly string[]) {}

  /** True only when fs.watch armed every root, or inotifywait reported watches established. */
  get coverageAttested(): boolean {
    return this.coverageClocks.length > 0;
  }

  /** Clocks that attested coverage. Order is fs.watch, then inotifywait. */
  get coverageClocks(): CoverageClock[] {
    const clocks: CoverageClock[] = [];
    if (this.fsArmed && !this.watchFailed) clocks.push("fs.watch");
    if (this.inotifyReady) clocks.push("inotifywait");
    return clocks;
  }

  async start(): Promise<void> {
    const initial = await snapshot(this.roots);
    for (const [file, signature] of initial) {
      this.baseline.set(file, signature);
      this.signatures.set(file, signature);
      this.known.add(file);
    }
    let armed = 0;
    for (const root of this.roots) {
      try {
        const handle = watch(root, { recursive: true }, (eventType, filename) => {
          void eventType;
          this.onFsEvent(root, filename);
        });
        handle.on("error", () => {
          this.watchFailed = true;
        });
        this.watchers.push(handle);
        armed += 1;
      } catch {
        // This root has no fs.watch handle. Coverage stays unattested unless inotifywait comes up.
      }
    }
    this.fsArmed = this.roots.length > 0 && armed === this.roots.length;
    this.armInotify();
    await this.waitForInotify();
  }

  private waitForInotify(): Promise<void> {
    if (!this.inotify) return Promise.resolve();
    const deadline = Date.now() + 2000;
    return new Promise((resolve) => {
      const tick = (): void => {
        if (this.inotifyReady || !this.inotify || this.inotify.exitCode !== null || Date.now() >= deadline) {
          resolve();
          return;
        }
        setTimeout(tick, 20);
      };
      tick();
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    for (const handle of this.watchers) handle.close();
    this.watchers.length = 0;
    if (this.inotify && this.inotify.exitCode === null && !this.inotify.killed) {
      try {
        this.inotify.kill("SIGTERM");
      } catch {
        // Already gone.
      }
    }
    this.inotify = undefined;
    await this.backfill();
  }

  private armInotify(): void {
    if (!inotifyAvailable()) return;
    const child = spawn(
      "inotifywait",
      [
        "-m",
        "-r",
        "-e",
        "create,delete,modify,moved_to,moved_from",
        "--format",
        "%e|%w%f",
        ...this.roots,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    recordSpawn("inotifywait");
    child.on("error", () => {
      this.inotify = undefined;
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      this.consumeInotify(chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").includes("Watches established")) this.inotifyReady = true;
    });
    this.inotify = child;
  }

  private consumeInotify(text: string): void {
    this.inotifyBuf += text;
    let nl = this.inotifyBuf.indexOf("\n");
    while (nl >= 0) {
      const line = this.inotifyBuf.slice(0, nl);
      this.inotifyBuf = this.inotifyBuf.slice(nl + 1);
      this.onInotifyLine(line);
      nl = this.inotifyBuf.indexOf("\n");
    }
  }

  private onInotifyLine(line: string): void {
    const at = monoNow();
    const sep = line.indexOf("|");
    if (sep < 0) return;
    const flags = line.slice(0, sep).split(",");
    if (flags.includes("ISDIR")) return;
    const file = line.slice(sep + 1);
    if (!file) return;
    this.observe(file, at);
  }

  private onFsEvent(root: string, filename: string | Buffer | null): void {
    const at = monoNow();
    if (!filename) {
      this.watchFailed = true;
      return;
    }
    this.observe(path.resolve(root, filename.toString()), at);
  }

  private observe(full: string, at: number): void {
    let info: Stats | undefined;
    try {
      const st = statSync(full);
      if (st.isDirectory()) return;
      if (st.isFile()) info = st;
    } catch {
      info = undefined;
    }
    if (info) {
      const sig = fileSignature(info);
      const previous = this.signatures.get(full);
      if (previous === sig) return;
      const kind = previous === undefined ? "create" : "modify";
      this.signatures.set(full, sig);
      this.known.add(full);
      this.push({ kind, path: full, at });
      return;
    }
    if (this.known.has(full)) {
      this.known.delete(full);
      this.signatures.delete(full);
      this.push({ kind: "delete", path: full, at });
      return;
    }
    const prior = this.records.filter((record) => record.path === full);
    if (!prior.some((record) => record.kind === "create")) {
      this.push({ kind: "create", path: full, at });
      return;
    }
    if (!prior.some((record) => record.kind === "delete")) {
      this.push({ kind: "delete", path: full, at });
    }
  }

  private push(record: WatchRecord): void {
    const prior = [...this.records].reverse().find((existing) => existing.path === record.path && existing.kind === record.kind);
    if (prior && Math.abs(prior.at - record.at) < DEDUP_NS) {
      if (record.at < prior.at) prior.at = record.at;
      return;
    }
    this.records.push(record);
  }

  private async backfill(): Promise<void> {
    const current = await snapshot(this.roots);
    const at = monoNow();
    for (const [file, sig] of current) {
      const prev = this.baseline.get(file);
      if (prev === undefined && !this.records.some((record) => record.path === file && record.kind === "create")) {
        this.push({ kind: "create", path: file, at });
      } else if (
        prev !== undefined &&
        prev !== sig &&
        !this.records.some((record) => record.path === file && (record.kind === "modify" || record.kind === "create"))
      ) {
        this.push({ kind: "modify", path: file, at });
      }
    }
    for (const file of this.baseline.keys()) {
      if (!current.has(file) && !this.records.some((record) => record.path === file && record.kind === "delete")) {
        this.push({ kind: "delete", path: file, at });
      }
    }
  }
}

function fileSignature(info: Stats): string {
  return `${info.mtimeMs}:${info.size}`;
}

async function snapshot(roots: readonly string[]): Promise<Map<string, string>> {
  const current = new Map<string, string>();
  for (const root of roots) await collectFiles(root, current);
  return current;
}

async function collectFiles(root: string, into: Map<string, string>): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(full, into);
    } else if (entry.isFile()) {
      try {
        into.set(full, fileSignature(await stat(full)));
      } catch {
        // Deleted between readdir and stat.
      }
    }
  }
}
