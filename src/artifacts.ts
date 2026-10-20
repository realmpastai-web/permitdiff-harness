import { readFileSync } from "node:fs";
import path from "node:path";
import { sha256Bytes } from "./hash";

export function formatCellTable(rows: readonly { scenario: string; version: string; cell: string }[]): string {
  const lines = ["| scenario | version | cell |", "| --- | --- | --- |"];
  for (const row of rows) lines.push(`| ${row.scenario} | ${row.version} | ${row.cell} |`);
  return `${lines.join("\n")}\n`;
}

export function formatSha256Sums(entries: readonly { file: string; hash: string }[]): string {
  const lines = entries
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((entry) => `${entry.hash}  ${entry.file}`);
  return `${lines.join("\n")}\n`;
}

export function verifySha256Sums(text: string, read: (file: string) => Buffer, root = process.cwd()): void {
  const lines = text.trim().split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error("SHA256SUMS is empty");
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (\S+)$/.exec(line);
    if (!match) throw new Error(`bad SHA256SUMS line: ${line}`);
    const got = sha256Bytes(read(path.resolve(root, match[2])));
    if (got !== match[1]) throw new Error(`SHA256SUMS mismatch for ${match[2]}`);
  }
}

export function verifySha256SumsFile(sumsPath: string, root = process.cwd()): void {
  verifySha256Sums(readFileSync(sumsPath, "utf8"), (file) => readFileSync(file), root);
}
