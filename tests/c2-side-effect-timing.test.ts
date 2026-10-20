import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONSUMES = [
  /kind\s*===\s*["']side_effect["']/,
  /sessionUpdate\s*===\s*["']side_effect["']/,
  /sessionUpdate\s*:\s*["']side_effect["']/,
  /type\s*===\s*["']side_effect["']/,
  /type\s*:\s*["']side_effect["']/,
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("C2 side_effect is not a timing source", () => {
  it("no src path consumes a side_effect event", () => {
    const hits: string[] = [];
    for (const file of tsFiles("src")) {
      const text = readFileSync(file, "utf8");
      for (const pattern of CONSUMES) {
        if (pattern.test(text)) hits.push(`${file} ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
    const pipeline = readFileSync("src/pipeline.ts", "utf8");
    expect(pipeline).toContain("watcher.records");
    expect(pipeline).toContain("sinkHits");
    expect(pipeline).not.toContain('type === "side_effect"');
    expect(pipeline).not.toContain("type === 'side_effect'");
  });
});
