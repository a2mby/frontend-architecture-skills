import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { ROOT, tmp, write } from "./helpers.mjs";
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

const INSTALL = path.join(ROOT, "scripts", "install.mjs");
const node = (args, env = {}) => spawnSync(process.execPath, [INSTALL, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
const skillNames = fs.readdirSync(path.join(ROOT, "skills"));

test("F-13: install into a clean directory (with spaces) copies every skill with a version marker, and the scanner runs from the copy", () => {
  const dir = path.join(tmp("fe install dir "), "my skills");
  const r = node(["--dir", dir]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const n of skillNames) {
    assert.ok(fs.existsSync(path.join(dir, n, "SKILL.md")), n);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, n, ".fe-skills.json"), "utf8")).package, "frontend-architecture-skills");
  }
  const scan = spawnSync(process.execPath, [path.join(dir, "fe-architecture", "scripts", "fe-scan.mjs"), path.join(ROOT, "evals/fixtures/react-seeded/src")], { encoding: "utf8" });
  assert.equal(scan.status, 1);
  assert.match(scan.stdout, /import-cycle/);
  const delta = spawnSync(process.execPath, [path.join(dir, "fe-review", "scripts", "scan-delta.mjs")], { encoding: "utf8" });
  assert.equal(delta.status, 2, "scan-delta resolves the scanner from the installed layout (usage error, not a crash)");
  assert.match(delta.stderr, /usage/);
});

test("F-13: default targets are ~/.claude/skills and ~/.agents/skills under a fake home; project scope uses the cwd", () => {
  const home = tmp("fe home ");
  const env = { HOME: home, USERPROFILE: home };
  assert.equal(node([], env).status, 0);
  assert.ok(fs.existsSync(path.join(home, ".claude", "skills", "fe-architecture", "SKILL.md")));
  assert.equal(node(["--target", "agents"], env).status, 0);
  assert.ok(fs.existsSync(path.join(home, ".agents", "skills", "fe-review", "SKILL.md")));
  const proj = tmp("fe proj ");
  const r = spawnSync(process.execPath, [INSTALL, "--scope", "project", "--target", "agents"], { cwd: proj, encoding: "utf8", env: { ...process.env, ...env } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(proj, ".agents", "skills", "fe-architecture", "SKILL.md")));
});

test("F-13: re-running is idempotent; a foreign same-name directory is refused and left byte-identical; unrelated skills survive", () => {
  const dir = tmp("fe skills ");
  write(dir, { "my-own-skill/SKILL.md": "mine", "fe-review/SKILL.md": "---\nname: fe-review\n---\nsomeone else's skill", "fe-review/notes.txt": "precious" });
  const r = node(["--dir", dir]);
  assert.equal(r.status, 1, "refusal is a non-zero exit");
  assert.match(r.stdout, /refused: .*fe-review/);
  assert.equal(fs.readFileSync(path.join(dir, "fe-review/notes.txt"), "utf8"), "precious");
  assert.equal(fs.readFileSync(path.join(dir, "my-own-skill/SKILL.md"), "utf8"), "mine");
  assert.ok(fs.existsSync(path.join(dir, "fe-architecture/.fe-skills.json")), "the other skills were installed");
  const again = node(["--dir", dir]);
  assert.match(again.stdout, /up to date/);
});

test("F-13: --update replaces a stale install, keeps locally modified files, and removes skills no longer shipped", () => {
  const dir = tmp("fe skills ");
  assert.equal(node(["--dir", dir]).status, 0);
  // simulate an older version that shipped an extra skill, and a modified file in another skill
  const old = path.join(dir, "fe-old");
  fs.mkdirSync(old); fs.writeFileSync(path.join(old, "SKILL.md"), "x");
  const m = JSON.parse(fs.readFileSync(path.join(dir, "fe-review/.fe-skills.json"), "utf8"));
  fs.writeFileSync(path.join(old, ".fe-skills.json"), JSON.stringify({ ...m, version: "0.0.1", files: { "SKILL.md": sha256("x") } }));
  fs.writeFileSync(path.join(dir, "fe-decide/SKILL.md"), "locally edited");
  for (const n of ["fe-enforce"]) { const mk = JSON.parse(fs.readFileSync(path.join(dir, n, ".fe-skills.json"), "utf8")); mk.version = "0.0.1"; fs.writeFileSync(path.join(dir, n, ".fe-skills.json"), JSON.stringify(mk)); }
  const r = node(["--dir", dir, "--update"]);
  assert.match(r.stdout, /updated: .*fe-enforce 0\.0\.1 ->/);
  assert.match(r.stdout, /removed \(no longer shipped\): .*fe-old/);
  assert.match(r.stdout, /kept \(locally modified.*fe-decide/);
  assert.equal(r.status, 1);
  assert.equal(fs.readFileSync(path.join(dir, "fe-decide/SKILL.md"), "utf8"), "locally edited");
  assert.ok(!fs.existsSync(old));
  const forced = node(["--dir", dir, "--update", "--overwrite-modified"]);
  assert.notEqual(fs.readFileSync(path.join(dir, "fe-decide/SKILL.md"), "utf8"), "locally edited");
  assert.equal(forced.status, 0, forced.stdout);
});


test("F-13: --adopt-legacy takes over an install made by the old install.sh (no marker) and --uninstall removes only marked directories", () => {
  const dir = tmp("fe skills ");
  fs.cpSync(path.join(ROOT, "skills", "fe-review"), path.join(dir, "fe-review"), { recursive: true });
  assert.equal(node(["--dir", dir]).status, 1, "unmarked copy is refused by default");
  assert.equal(node(["--dir", dir, "--update", "--adopt-legacy"]).status, 0);
  write(dir, { "keep-me/SKILL.md": "x" });
  const u = node(["--dir", dir, "--uninstall"]);
  assert.equal(u.status, 0, u.stdout);
  for (const n of skillNames) assert.ok(!fs.existsSync(path.join(dir, n)), n);
  assert.ok(fs.existsSync(path.join(dir, "keep-me/SKILL.md")));
});

test("F-13: --list shows installed versions; --dry-run changes nothing; bad arguments exit 2", () => {
  const dir = tmp("fe skills ");
  const dry = node(["--dir", dir, "--dry-run"]);
  assert.match(dry.stdout, /would install/);
  assert.deepEqual(fs.readdirSync(dir), []);
  node(["--dir", dir]);
  assert.match(node(["--dir", dir, "--list"]).stdout, /fe-architecture: \d+\.\d+\.\d+/);
  assert.equal(node(["--bogus"]).status, 2);
  assert.equal(node(["--target", "nowhere"]).status, 2);
});

test("F-13: scripts/install.sh still works as a wrapper", { skip: process.platform === "win32" }, () => {
  const dir = tmp("fe skills ");
  const r = spawnSync("bash", [path.join(ROOT, "scripts", "install.sh"), "--dir", dir], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, "fe-architecture", "SKILL.md")));
});
