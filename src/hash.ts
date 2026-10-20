import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export function sha256Bytes(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Stable sha256 of a directory: sorted relative paths plus file bytes. */
export function sha256Dir(dir: string): string {
  const files: string[] = [];
  const walk = (current: string): void => {
    const names = readdirSync(current).sort();
    for (const name of names) {
      const full = path.join(current, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile()) {
        files.push(path.relative(dir, full).split(path.sep).join("/"));
      }
    }
  };
  walk(dir);
  files.sort();
  const hash = createHash("sha256");
  for (const rel of files) {
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(path.join(dir, rel)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
