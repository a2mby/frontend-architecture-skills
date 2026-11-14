import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmp, write, ALIAS } from "./helpers.mjs";

const DELTA = fileURLToPath(new URL("../skills/fe-review/scripts/scan-delta.mjs", import.meta.url));
const git = (dir, ...args) => { const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const delta = (dir, args) => spawnSync("node", [DELTA, ...args], { cwd: dir, encoding: "utf8" });

function repo() {
  const dir = write(tmp("fe delta repo "), {
    "tsconfig.json": ALIAS,
    "src/features/cart/index.ts": "export {};", "src/features/cart/internal/p.ts": "export const p = 1;",
    "src/features/checkout/index.ts": "export const x = 1;",
  });
  git(dir, "init", "-q", "-b", "main"); git(dir, "add", "-A"); git(dir, "commit", "-qm", "base");
  return dir;
}

test("F-12 scan-delta: reports a new deep import against the base and leaves the worktree untouched", () => {
  const dir = repo();
  git(dir, "checkout", "-qb", "feature");
  write(dir, { "src/features/checkout/index.ts": "import { p } from '@/features/cart/internal/p'; export const x = p;" });
  git(dir, "commit", "-qam", "bad import");
  write(dir, { "untracked-note.txt": "keep me" });
  const before = git(dir, "status", "--porcelain");
  const r = delta(dir, ["main", "--root", "src"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /NEW \(1\)[\s\S]*deep-import/);
  assert.equal(git(dir, "status", "--porcelain"), before, "worktree unchanged");
  assert.equal(git(dir, "worktree", "list").split("\n").length, 1, "temporary worktree removed");
  assert.equal(git(dir, "stash", "list"), "", "no stash used");
  assert.ok(fs.existsSync(path.join(dir, "untracked-note.txt")));
});

test("F-12 scan-delta: a clean change reports nothing new and exits 0", () => {
  const dir = repo();
  git(dir, "checkout", "-qb", "feature");
  write(dir, { "src/features/checkout/more.ts": "export const m = 1;" });
  git(dir, "add", "-A"); git(dir, "commit", "-qm", "more");
  const r = delta(dir, ["main", "--root", "src", "--json"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).newFindings.length, 0);
});

test("F-12 scan-delta: option-shaped, shell-shaped, and unknown refs are refused without side effects", () => {
  const dir = repo();
  const marker = path.join(dir, "pwned");
  const attacks = ["--output=" + marker, "-h", "--exec=touch " + marker, `$(touch ${marker})`, "main; touch " + marker, "`touch " + marker + "`", "main\ntouch x", "nope-branch", "", "main^{tree}x"];
  for (const ref of attacks) {
    const r = delta(dir, [ref, "--root", "src"]);
    assert.notEqual(r.status, 0, `ref ${JSON.stringify(ref)} must not succeed`);
  }
  assert.equal(fs.existsSync(marker), false);
  assert.equal(git(dir, "worktree", "list").split("\n").length, 1);
  assert.equal(git(dir, "status", "--porcelain"), "");
});

test("F-12 scan-delta: a ref that merely looks odd but is valid still works (tag with dots and slashes)", () => {
  const dir = repo();
  git(dir, "tag", "release/v1.0.0");
  const r = delta(dir, ["release/v1.0.0", "--root", "src"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("F-12 scan-delta: a source root outside the repo is refused", () => {
  const dir = repo();
  assert.notEqual(delta(dir, ["main", "--root", tmp()]).status, 0);
});
