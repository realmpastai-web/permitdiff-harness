import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatSha256Sums, verifySha256Sums, verifySha256SumsFile } from "../src/artifacts";
import { sha256Bytes } from "../src/hash";
import { emitKnownAnswerArtifacts } from "../src/scenarios/c3";

describe("A7 SHA256SUMS", () => {
  it("writes a self-consistent sums file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "permitdiff-sums-"));
    const body = "{\"ok\":true}\n";
    await writeFile(path.join(dir, "run.json"), body);
    const sums = formatSha256Sums([{ file: "run.json", hash: sha256Bytes(body) }]);
    await writeFile(path.join(dir, "SHA256SUMS"), sums);
    verifySha256Sums(sums, (file) => readFileSync(file), dir);
    expect(sums).toMatch(/^[a-f0-9]{64}  run\.json\n$/);
  });

  it("emits SHA256SUMS for the known-answer artifacts", async () => {
    const report = await emitKnownAnswerArtifacts();
    expect(report.knownAnswer).toBe("OK");
    verifySha256SumsFile(path.join(process.cwd(), "SHA256SUMS"));
    const sums = await readFile("SHA256SUMS", "utf8");
    expect(sums).toContain("artifacts/run.json");
    expect(sums).toContain("artifacts/c3-table.txt");
    expect(sums).toContain("docs/AMENDMENT-1.md");
    expect(sums).toContain("docs/AMENDMENT-2.md");
    expect(sums).toContain("docs/AMENDMENT-3.md");
    expect(sums).toContain("7b79ed2d84f72717b8f78afba8c20f65ee0e9c48e8eb5d0efbf6b4b1e7d9de42  artifacts/c3-table.txt");
    expect(sums).toContain("7163696d1d4529bdd2d4c232d7feea68c3b9e6715a91228774a01b89c0d28e57  artifacts/run.json");
    console.log(sums);
  });
});
