#!/usr/bin/env node
// Cross-platform installer for the fe-* skills. Copies skills/<name>/ into a skills directory and stamps each
// copy with .fe-skills.json (package version + file hashes) so later runs can update or remove only what this
// package installed. It never touches a directory it did not install; a same-name foreign directory is refused.
//   node scripts/install.mjs [--target claude|agents] [--scope user|project] [--dir <path>]
//                            [--update] [--uninstall] [--list] [--dry-run] [--adopt-legacy] [--overwrite-modified]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const MARKER = ".fe-skills.json";
const PACKAGE = "frontend-architecture-skills";
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const srcDir = path.join(repo, "skills");
const version = JSON.parse(fs.readFileSync(path.join(repo, ".claude-plugin", "plugin.json"), "utf8")).version;

export function parseArgs(argv) {
  const o = { target: "claude", scope: "user", dir: null, update: false, uninstall: false, list: false, dryRun: false, adoptLegacy: false, overwriteModified: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === "--target") o.target = next();
    else if (a === "--scope") o.scope = next();
    else if (a === "--dir") o.dir = next();
    else if (a === "--update") o.update = true;
    else if (a === "--uninstall") o.uninstall = true;
    else if (a === "--list") o.list = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--adopt-legacy") o.adoptLegacy = true;
    else if (a === "--overwrite-modified") o.overwriteModified = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!["claude", "agents"].includes(o.target)) throw new Error(`--target must be claude or agents (use --dir for another location)`);
  if (!["user", "project"].includes(o.scope)) throw new Error(`--scope must be user or project`);
  return o;
}

export function targetDir(o, cwd = process.cwd()) {
  if (o.dir) return path.resolve(cwd, o.dir);
  const base = o.scope === "user" ? os.homedir() : cwd;
  return path.join(base, o.target === "claude" ? ".claude" : ".agents", "skills");
}

const hashFile = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
function listFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out); else if (e.name !== MARKER) out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
}
const hashes = (dir) => Object.fromEntries(listFiles(dir).map((f) => [f, hashFile(path.join(dir, f))]));
const readMarker = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, MARKER), "utf8")); } catch { return null; } };
const isLegacyOurs = (name, dir) => {
  const skill = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skill)) return false;
  const text = fs.readFileSync(skill, "utf8");
  return new RegExp(`^name:\\s*${name}\\s*$`, "m").test(text) && /fe-architecture/.test(text);
};
const modified = (dir, marker) => { const now = hashes(dir); return Object.keys({ ...now, ...marker.files }).filter((f) => now[f] !== marker.files?.[f]); };

export function run(o, log = console.log) {
  const target = targetDir(o);
  const skills = fs.readdirSync(srcDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const result = { target, installed: [], updated: [], removed: [], skipped: [], refused: [] };
  const say = (m) => log(m);

  if (o.list) {
    if (!fs.existsSync(target)) { say(`${target}: no skills directory`); return result; }
    for (const name of fs.readdirSync(target)) {
      const m = readMarker(path.join(target, name));
      if (m?.package === PACKAGE) say(`${name}: ${m.version}${m.version !== version ? ` (package has ${version})` : ""}`);
    }
    return result;
  }

  if (o.uninstall) {
    if (!fs.existsSync(target)) { say(`nothing to uninstall: ${target} does not exist`); return result; }
    for (const name of fs.readdirSync(target)) {
      const dir = path.join(target, name);
      const m = readMarker(dir);
      if (m?.package !== PACKAGE) continue;
      const mod = modified(dir, m);
      if (mod.length && !o.overwriteModified) { result.refused.push(name); say(`kept (locally modified: ${mod.slice(0, 3).join(", ")}): ${dir}; use --overwrite-modified to remove`); continue; }
      if (!o.dryRun) fs.rmSync(dir, { recursive: true, force: true });
      result.removed.push(name); say(`${o.dryRun ? "would remove" : "removed"}: ${dir}`);
    }
    return result;
  }

  if (!o.dryRun) fs.mkdirSync(target, { recursive: true });
  const stamp = (dir) => fs.writeFileSync(path.join(dir, MARKER), JSON.stringify({ package: PACKAGE, version, installedAt: new Date().toISOString(), files: hashes(dir) }, null, 2) + "\n");
  const place = (name, replacing) => {
    const dest = path.join(target, name), staging = path.join(target, `.${name}.fe-staging`);
    if (o.dryRun) return;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.cpSync(path.join(srcDir, name), staging, { recursive: true });
    stamp(staging);
    if (replacing) fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(staging, dest);
  };
  for (const name of skills) {
    const dest = path.join(target, name);
    if (!fs.existsSync(dest)) { place(name, false); result.installed.push(name); say(`${o.dryRun ? "would install" : "installed"}: ${dest}`); continue; }
    const m = readMarker(dest);
    if (m?.package !== PACKAGE) {
      if (o.adoptLegacy && isLegacyOurs(name, dest)) { place(name, true); result.updated.push(name); say(`adopted legacy install: ${dest}`); continue; }
      result.refused.push(name); say(`refused: ${dest} exists and was not installed by this package (leaving it alone; for an install from the old install.sh use --update --adopt-legacy)`); continue;
    }
    if (m.version === version && !o.update) { result.skipped.push(name); say(`up to date (${version}): ${dest}`); continue; }
    if (!o.update) { result.skipped.push(name); say(`installed ${m.version}, package has ${version}: ${dest} (run with --update)`); continue; }
    const mod = modified(dest, m);
    if (mod.length && !o.overwriteModified) { result.refused.push(name); say(`kept (locally modified: ${mod.slice(0, 3).join(", ")}): ${dest}; use --overwrite-modified to replace`); continue; }
    place(name, true); result.updated.push(name); say(`${o.dryRun ? "would update" : "updated"}: ${dest} ${m.version} -> ${version}`);
  }
  if (o.update && fs.existsSync(target)) {
    for (const name of fs.readdirSync(target)) {
      if (skills.includes(name) || name.startsWith(".")) continue;
      const dir = path.join(target, name), m = readMarker(dir);
      if (m?.package !== PACKAGE) continue;
      if (modified(dir, m).length && !o.overwriteModified) { result.refused.push(name); say(`kept (no longer shipped, locally modified): ${dir}`); continue; }
      if (!o.dryRun) fs.rmSync(dir, { recursive: true, force: true });
      result.removed.push(name); say(`${o.dryRun ? "would remove" : "removed"} (no longer shipped): ${dir}`);
    }
  }
  if (result.installed.length || result.updated.length) say("Next: run the fe-init-profile skill in your project (in Claude Code: /fe-init-profile).");
  return result;
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 6).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); process.exit(0); }
    const r = run(o);
    process.exit(r.refused.length ? 1 : 0);
  } catch (e) { console.error(`install failed: ${e.message}`); process.exit(2); }
}
