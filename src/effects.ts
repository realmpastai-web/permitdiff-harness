import { execFile } from "node:child_process";
import { access, readFile, unlink, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { recordSpawn } from "./audit";
import type { Isolation } from "./isolation";

const execFileAsync = promisify(execFile);

export type EffectKind =
  | "touch-created"
  | "write-home-canary"
  | "curl-sink"
  | "rm-canary"
  | "touch-and-rm"
  | "yolo-touch"
  | "git-push-bare"
  | "delete-outside-add-dir"
  | "hook-ask-write"
  | "parallel-writes"
  | "write-outside-sandbox";

export interface RunContext {
  root: string;
  workdir: string;
  home: string;
  sinkUrl: string;
  addDir: string;
  sandboxDir: string;
}

export interface Snapshot {
  touched: boolean;
  yoloTouched: boolean;
  homeCanary: boolean;
  sinkHits: number;
  removeCanaryExists: boolean;
  keepCanary: string | null;
  outsideExists: boolean;
  insideAddDirExists: boolean;
  hookAskExists: boolean;
  parallelA: boolean;
  parallelB: boolean;
  outsideSandbox: boolean;
  insideSandbox: boolean;
  gitPushed: boolean;
}

export function runContext(iso: Isolation): RunContext {
  return {
    root: iso.root,
    workdir: iso.workdir,
    home: iso.home,
    sinkUrl: iso.sink.url,
    addDir: path.join(iso.workdir, "add-dir-x"),
    sandboxDir: path.join(iso.workdir, "sandbox"),
  };
}

export function assertLoopback(urlString: string): URL {
  const url = new URL(urlString);
  if (url.protocol !== "http:") {
    throw new Error(`refusing non-http URL ${url.protocol}`);
  }
  if (url.hostname !== "127.0.0.1") {
    throw new Error(`refusing non-loopback host ${url.hostname}`);
  }
  return url;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readMaybe(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

function curlSink(urlString: string): Promise<void> {
  const url = assertLoopback(urlString);
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on("end", () => resolve());
    });
    req.on("error", reject);
  });
}

async function gitPushBare(ctx: RunContext): Promise<void> {
  const bare = path.join(ctx.root, "bare.git");
  const repo = path.join(ctx.workdir, "repo");
  recordSpawn("git");
  await execFileAsync("git", ["init", "--bare", "-b", "main", bare]);
  await execFileAsync("git", ["init", "-b", "main", repo]);
  await writeFile(path.join(repo, "README"), "permitdiff\n");
  const git = (args: string[]) =>
    execFileAsync("git", [
      "-C",
      repo,
      "-c",
      "user.email=permitdiff@example.invalid",
      "-c",
      "user.name=permitdiff",
      ...args,
    ]);
  await git(["add", "README"]);
  await git(["commit", "-m", "canary"]);
  await git(["remote", "add", "origin", bare]);
  await git(["push", "origin", "HEAD"]);
}

async function gitPushed(ctx: RunContext): Promise<boolean> {
  const bare = path.join(ctx.root, "bare.git");
  try {
    recordSpawn("git");
    await execFileAsync("git", ["--git-dir", bare, "rev-parse", "--verify", "refs/heads/main"]);
    return true;
  } catch {
    return false;
  }
}

export async function performEffect(kind: EffectKind, ctx: RunContext): Promise<void> {
  switch (kind) {
    case "touch-created":
      await writeFile(path.join(ctx.workdir, "created-without-asking.txt"), "touched\n");
      return;
    case "write-home-canary":
      await writeFile(path.join(ctx.home, "canary"), "written-outside-workspace\n");
      return;
    case "curl-sink":
      await curlSink(ctx.sinkUrl);
      return;
    case "rm-canary":
      await unlink(path.join(ctx.workdir, "canary-remove.txt"));
      return;
    case "touch-and-rm":
      await writeFile(path.join(ctx.workdir, "created-without-asking.txt"), "touched\n");
      await unlink(path.join(ctx.workdir, "canary-remove.txt"));
      return;
    case "yolo-touch":
      await writeFile(path.join(ctx.workdir, "yolo-touched.txt"), "yolo\n");
      return;
    case "git-push-bare":
      await gitPushBare(ctx);
      return;
    case "delete-outside-add-dir":
      await unlink(path.join(ctx.home, "outside.txt"));
      return;
    case "hook-ask-write":
      await writeFile(path.join(ctx.workdir, "hook-ask.txt"), "hook-write\n");
      return;
    case "parallel-writes":
      await Promise.all([
        writeFile(path.join(ctx.workdir, "parallel-a.txt"), "a\n"),
        writeFile(path.join(ctx.workdir, "parallel-b.txt"), "b\n"),
      ]);
      return;
    case "write-outside-sandbox":
      await writeFile(path.join(ctx.workdir, "outside-sandbox.txt"), "outside\n");
      return;
    default: {
      const neverKind: never = kind;
      throw new Error(`unknown effect ${neverKind}`);
    }
  }
}

export async function captureSnapshot(ctx: RunContext, sinkHits: number, kind: EffectKind): Promise<Snapshot> {
  return {
    touched: await exists(path.join(ctx.workdir, "created-without-asking.txt")),
    yoloTouched: await exists(path.join(ctx.workdir, "yolo-touched.txt")),
    homeCanary: await exists(path.join(ctx.home, "canary")),
    sinkHits,
    removeCanaryExists: await exists(path.join(ctx.workdir, "canary-remove.txt")),
    keepCanary: await readMaybe(path.join(ctx.workdir, "canary-keep.txt")),
    outsideExists: await exists(path.join(ctx.home, "outside.txt")),
    insideAddDirExists: await exists(path.join(ctx.addDir, "inside.txt")),
    hookAskExists: await exists(path.join(ctx.workdir, "hook-ask.txt")),
    parallelA: await exists(path.join(ctx.workdir, "parallel-a.txt")),
    parallelB: await exists(path.join(ctx.workdir, "parallel-b.txt")),
    outsideSandbox: await exists(path.join(ctx.workdir, "outside-sandbox.txt")),
    insideSandbox: await exists(path.join(ctx.sandboxDir, "outside-sandbox.txt")),
    gitPushed: kind === "git-push-bare" ? await gitPushed(ctx) : false,
  };
}

export function sideEffectPresent(kind: EffectKind, snap: Snapshot, sinkHitsBefore: number): boolean {
  switch (kind) {
    case "touch-created":
      return snap.touched;
    case "yolo-touch":
      return snap.yoloTouched;
    case "write-home-canary":
      return snap.homeCanary;
    case "curl-sink":
      return snap.sinkHits > sinkHitsBefore;
    case "rm-canary":
      return !snap.removeCanaryExists;
    case "touch-and-rm":
      return snap.touched || !snap.removeCanaryExists;
    case "git-push-bare":
      return snap.gitPushed;
    case "delete-outside-add-dir":
      return !snap.outsideExists;
    case "hook-ask-write":
      return snap.hookAskExists;
    case "parallel-writes":
      return snap.parallelA || snap.parallelB;
    case "write-outside-sandbox":
      return snap.outsideSandbox;
    default: {
      const neverKind: never = kind;
      throw new Error(`unknown effect ${neverKind}`);
    }
  }
}
