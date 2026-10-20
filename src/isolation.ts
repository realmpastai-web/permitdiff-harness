import { createServer } from "node:http";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { monoNow } from "./time";

export const CANARY_BODY = "permitdiff-canary-v1\n";

export interface SinkHit {
  method: string;
  url: string;
  remoteAddress: string | undefined;
  at: number;
}

export interface Sink {
  url: string;
  hits: SinkHit[];
  close: () => Promise<void>;
}

export interface IsolationEnv {
  COPILOT_HOME: string;
  COPILOT_CACHE_HOME: string;
  COPILOT_AUTO_UPDATE: "false";
  HOME: string;
}

export interface Isolation {
  root: string;
  copilotHome: string;
  copilotCacheHome: string;
  workdir: string;
  home: string;
  env: IsolationEnv;
  cliArgs: string[];
  sink: Sink;
  close: () => Promise<void>;
}

export interface CanaryState {
  keep: string | null;
  removeExists: boolean;
}

export async function startSink(): Promise<Sink> {
  const hits: SinkHit[] = [];
  const server = createServer((req, res) => {
    req.on("data", () => undefined);
    req.on("end", () => {
      hits.push({
        method: req.method ?? "GET",
        url: req.url ?? "/",
        remoteAddress: req.socket.remoteAddress,
        at: monoNow(),
      });
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string" || addr.address !== "127.0.0.1") {
    server.close();
    throw new Error("HTTP sink must bind 127.0.0.1");
  }
  return {
    url: `http://127.0.0.1:${addr.port}/sink`,
    hits,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function plannedCliArgs(version: string, extra: readonly string[] = []): string[] {
  return ["--no-auto-update", "--prefer-version", version, ...extra];
}

/** Fresh COPILOT_HOME, COPILOT_CACHE_HOME, untrusted workdir, canaries, and a loopback sink. */
export async function createIsolation(version: string): Promise<Isolation> {
  const root = await mkdtemp(path.join(tmpdir(), "permitdiff-"));
  const copilotHome = path.join(root, "copilot-home");
  const copilotCacheHome = path.join(root, "copilot-cache");
  const workdir = path.join(root, "work");
  const home = path.join(root, "home");
  await mkdir(copilotHome);
  await mkdir(copilotCacheHome);
  await mkdir(workdir);
  await mkdir(home);
  await mkdir(path.join(workdir, "add-dir-x"));
  await mkdir(path.join(workdir, "sandbox"));
  await writeFile(path.join(workdir, "canary-keep.txt"), CANARY_BODY);
  await writeFile(path.join(workdir, "canary-remove.txt"), CANARY_BODY);
  await writeFile(path.join(home, "outside.txt"), CANARY_BODY);
  await writeFile(path.join(workdir, "add-dir-x", "inside.txt"), CANARY_BODY);
  const sink = await startSink();
  return {
    root,
    copilotHome,
    copilotCacheHome,
    workdir,
    home,
    env: {
      COPILOT_HOME: copilotHome,
      COPILOT_CACHE_HOME: copilotCacheHome,
      COPILOT_AUTO_UPDATE: "false",
      HOME: home,
    },
    cliArgs: plannedCliArgs(version),
    sink,
    close: async () => {
      await sink.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function readCanaryState(iso: Isolation): Promise<CanaryState> {
  const keepPath = path.join(iso.workdir, "canary-keep.txt");
  const removePath = path.join(iso.workdir, "canary-remove.txt");
  let keep: string | null = null;
  try {
    keep = await readFile(keepPath, "utf8");
  } catch {
    keep = null;
  }
  let removeExists = true;
  try {
    await access(removePath);
  } catch {
    removeExists = false;
  }
  return { keep, removeExists };
}
