import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SCANNER = path.join(ROOT, "skills", "fe-architecture", "scripts", "fe-scan.mjs");
export const FIXTURES = path.join(ROOT, "tests", "fixtures");

export function tmp(prefix = "fe-test-") { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
export function write(dir, files) {
  for (const [name, body] of Object.entries(files)) {
    const f = path.join(dir, name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof body === "string" ? body : JSON.stringify(body, null, 2));
  }
  return dir;
}
/** Copy a tests/fixtures/<name> tree into a fresh temp dir so parent configs of this repo never leak in. */
export function copyFixture(name) {
  const dir = tmp(`fe-fx-${name}-`);
  fs.cpSync(path.join(FIXTURES, name), dir, { recursive: true });
  return dir;
}
export function canSymlink() {
  const d = tmp("fe-symlink-probe-");
  try { fs.symlinkSync(d, path.join(d, "probe")); return true; } catch { return false; }
}
export const cli = (args, opts = {}) => spawnSync("node", [SCANNER, ...args], { encoding: "utf8", ...opts });
export const ALIAS = { compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } };
