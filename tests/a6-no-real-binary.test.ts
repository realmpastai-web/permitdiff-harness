import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copilotSpawns, spawnAudit } from "../src/audit";
import { assertLoopback } from "../src/effects";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe("A6 no real binary", () => {
  it("never installs, downloads, or executes @github/copilot", () => {
    const pkg = readFileSync("package.json", "utf8");
    const lock = readFileSync("package-lock.json", "utf8");
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(pkg).not.toContain("@github/copilot");
    expect(lock).not.toContain("@github/copilot");
    expect(dockerfile).not.toMatch(/npm\s+(install|ci|i)\s+[^\n]*@github\/copilot/);
    expect(dockerfile).not.toContain("copilot login");
    expect(existsSync("node_modules/@github/copilot")).toBe(false);
    if (existsSync("node_modules/@github")) {
      const names = readdirSync("node_modules/@github");
      expect(names.some((name) => name.startsWith("copilot"))).toBe(false);
    }

    const sources = walk("src").concat(walk("tests"));
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/spawn\(\s*["'][^"']*copilot/);
      expect(text).not.toMatch(/execFile\(\s*["'][^"']*copilot/);
      expect(text).not.toMatch(/execSync\(\s*["'][^"']*copilot/);
    }

    expect(spawnAudit().some((command) => /copilot/i.test(command))).toBe(false);
    expect(copilotSpawns()).toEqual([]);
    expect(() => assertLoopback("http://example.com/sink")).toThrow(/non-loopback/);
    expect(() => assertLoopback("https://127.0.0.1/sink")).toThrow(/non-http/);
    expect(assertLoopback("http://127.0.0.1:9/sink").hostname).toBe("127.0.0.1");

    console.log(
      "A6 AUDIT: package.json, package-lock.json, Dockerfile, and node_modules have no @github/copilot; no copilot process was spawned; HTTP is limited to 127.0.0.1",
    );
  });
});
