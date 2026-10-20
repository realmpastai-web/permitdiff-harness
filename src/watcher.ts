import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { monoNow } from "./time";

export interface WatchRecord {
  kind: "create" | "modify" | "delete";
  path: string;
  at: number;
}

/**
 * Records create, modify, and delete under the workdir, canary files, and
 * ~/canary. The fake server does not emit a side_effect event; this watcher
 * is the clock for those effects.
 */
export class SideEffectWatcher {
  readonly records: WatchRecord[] = [];
  private known = new Map<string, string>();
  private readonly watchers: FSWatcher[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private chain: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly roots: readonly string[]) {}

  async start(): Promise<void> {
    await this.scan(false);
    for (const root of this.roots) {
      try {
        const handle = watch(root, { recursive: true }, () => {
          this.schedule();
        });
        handle.on("error", () => undefined);
        this.watchers.push(handle);
      } catch {
        // Polling below still observes the tree if recursive watch is unavailable.
      }
    }
    this.timer = setInterval(() => this.schedule(), 10);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    for (const handle of this.watchers) handle.close();
    await this.chain;
    await this.scan(true);
  }

  private schedule(): void {
    this.chain = this.chain.then(() => this.scan(true)).catch(() => undefined);
  }

  private async scan(record: boolean): Promise<void> {
    const current = new Map<string, string>();
    for (const root of this.roots) {
      await collectFiles(root, current);
    }
    if (record) {
      const at = monoNow();
      for (const [file, signature] of current) {
        const previous = this.known.get(file);
        if (previous === undefined) {
          this.records.push({ kind: "create", path: file, at });
        } else if (previous !== signature) {
          this.records.push({ kind: "modify", path: file, at });
        }
      }
      for (const file of this.known.keys()) {
        if (!current.has(file)) this.records.push({ kind: "delete", path: file, at });
      }
    }
    this.known = current;
  }
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
        const info = await stat(full);
        into.set(full, `${info.mtimeMs}:${info.size}`);
      } catch {
        // Deleted between readdir and stat. The next scan records it.
      }
    }
  }
}
