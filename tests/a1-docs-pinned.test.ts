import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PINNED: Record<string, string> = {
  "docs/BLACKBOX-DIFFER-SPEC.md": "91efd47e025559e99c6756ca27be0b8039b45f2dc8bd58669b15ff864106c0e2",
  "docs/CACHE-FINDINGS.md": "60845a15acd052877c34eaa5909a32ab952f89a71a6185f5821c7ef6988b2577",
  "docs/PREDICTIONS-v2.txt": "0122afdff2c9753ac92244f7cf1870f9b7e0c3950eb49393ec985b8754df2804",
};

describe("A1 docs pinned", () => {
  for (const [file, sha] of Object.entries(PINNED)) {
    it(`${file} matches sha256 ${sha}`, () => {
      const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
      expect(digest).toBe(sha);
    });
  }
});
