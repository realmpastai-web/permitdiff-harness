import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyTrial } from "../src/classify";
import { SideEffectWatcher } from "../src/watcher";

describe("C1 watcher coverage", () => {
  it("does not attest coverage for a missing root, so the classifier stays INCONCLUSIVE", async () => {
    const missing = path.join(tmpdir(), `permitdiff-missing-${process.pid}-no-such`);
    const watcher = new SideEffectWatcher([missing]);
    await watcher.start();
    try {
      expect(watcher.coverageAttested).toBe(false);
      expect(watcher.records).toEqual([]);
      expect(
        classifyTrial({
          toolCallUpdateSeen: true,
          permissionRequestSeen: true,
          permissionRequestBeforeSideEffect: true,
          sideEffectPresent: false,
          watcherCoverageAttested: watcher.coverageAttested,
        }),
      ).toBe("INCONCLUSIVE");
    } finally {
      await watcher.close();
    }
  });

  it("records a create+delete with no pause between write and unlink", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "permitdiff-fast-"));
    const watcher = new SideEffectWatcher([root]);
    await watcher.start();
    try {
      const file = path.join(root, "created-without-asking.txt");
      await writeFile(file, "fast\n");
      await unlink(file);
      await watcher.close();
      const touched = watcher.records.filter((record) => record.path === file);
      const creates = touched.filter((record) => record.kind === "create");
      console.log(
        `C1 FAST_NO_PAUSE coverage=${watcher.coverageAttested} kinds=${touched.map((record) => record.kind).join(",")}`,
      );
      expect(watcher.coverageAttested).toBe(true);
      expect(creates.length).toBeGreaterThan(0);
      const deletes = touched.filter((record) => record.kind === "delete");
      if (deletes.length > 0) expect(creates[0] && deletes[0] && creates[0].at < deletes[0].at).toBe(true);
    } finally {
      await watcher.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
