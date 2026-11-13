#!/usr/bin/env node
// Validates the skills package against its own acceptance checks. Exit 1 on any failure.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(root, "skills");
const failures = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);
const rel = (p) => path.relative(root, p);

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const read = (p) => fs.readFileSync(p, "utf8");
const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0 && !line.startsWith("#")) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return fm;
};

// 1. Skill frontmatter and invocation mode
const skillNames = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
for (const name of skillNames) {
  const file = path.join(skillsDir, name, "SKILL.md");
  if (!fs.existsSync(file)) { fail("frontmatter", `${name}: SKILL.md missing`); continue; }
  const text = read(file);
  const fm = frontmatter(text);
  if (!fm) { fail("frontmatter", `${name}: no frontmatter`); continue; }
  if (fm.name !== name) fail("frontmatter", `${name}: name "${fm.name}" differs from directory`);
  if (!fm.description) fail("frontmatter", `${name}: description missing`);
  if (fm.description && fm.description.length > 420) fail("budget", `${name}: description ${fm.description.length} chars (max 420)`);
  const lines = text.split("\n").length;
  if (lines > 200) fail("budget", `${name}: SKILL.md ${lines} lines (max 200)`);
  const modelInvoked = name === "fe-architecture";
  if (modelInvoked && fm["disable-model-invocation"] === "true") fail("invocation", `${name}: must stay model-invoked`);
  if (!modelInvoked && fm["disable-model-invocation"] !== "true") fail("invocation", `${name}: workflow skills are user-invoked (disable-model-invocation: true)`);
  // 2. Completion criteria in numbered workflows
  if (!modelInvoked && name !== "fe") {
    const steps = (text.match(/^\d+\. \*\*/gm) ?? []).length;
    const dones = (text.match(/\bDone (when|per batch when)\b/g) ?? []).length;
    if (steps && dones < Math.ceil(steps / 2)) fail("completion", `${name}: ${dones} completion criteria for ${steps} steps (need at least half)`);
  }
}

// 3. Links resolve
const mdFiles = walk(root).filter((f) => f.endsWith(".md") && !f.includes("node_modules") && !f.includes(`${path.sep}.git${path.sep}`));
for (const file of mdFiles) {
  const text = read(file).replace(/```[\s\S]*?```/g, "");
  for (const m of text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) fail("links", `${rel(file)}: broken link ${target}`);
  }
}

// 4. Reference header contract
const refFiles = walk(path.join(skillsDir, "fe-architecture", "references")).filter((f) => f.endsWith(".md"));
for (const file of refFiles) {
  const head = read(file).split("\n").slice(0, 8).join("\n");
  for (const label of ["**Why it exists:**", "**Use when:**", "**Do not use when:**"]) {
    if (!head.includes(label)) fail("reference-header", `${rel(file)}: missing ${label}`);
  }
}

// 5. Every reference is reachable from the core skill's index
const core = read(path.join(skillsDir, "fe-architecture", "SKILL.md"));
for (const file of refFiles) {
  const target = path.relative(path.join(skillsDir, "fe-architecture"), file).split(path.sep).join("/");
  const reachable = core.includes(`(${target})`) || refFiles.some((o) => o !== file && read(o).includes(path.basename(file)));
  if (!reachable) fail("reachability", `${target}: not linked from the core index or any sibling reference`);
}

// 6. Portability: no project-specific facts in skills (profiles under examples/ may hold them)
const banned = [/A Square/i, /A-Square/i, /ASquare/i, /apps\/web/, /Turborepo/, /\bthis repo\b/i, /\bCareersApply\b/, /ServiceRequest/, /BFF_INTERNAL_URL/];
for (const file of walk(skillsDir).filter((f) => /\.(md|mjs)$/.test(f))) {
  const text = read(file);
  for (const re of banned) if (re.test(text)) fail("portability", `${rel(file)}: matches ${re}`);
}

// 7. Single source of truth: core model text lives only in fe-architecture/SKILL.md
const ownedPhrases = ["Used by one component: colocate", "A signal is **firm**", "Promote only when a **second real consumer**", "One authoritative owner per datum"];
for (const name of skillNames.filter((n) => n !== "fe-architecture")) {
  const text = read(path.join(skillsDir, name, "SKILL.md"));
  for (const phrase of ownedPhrases) if (text.includes(phrase)) fail("single-source", `${name}: restates a core rule ("${phrase}")`);
}
for (const phrase of ownedPhrases) {
  const holders = walk(skillsDir).filter((f) => f.endsWith(".md") && read(f).includes(phrase));
  if (holders.length > 1) fail("single-source", `"${phrase}" defined in ${holders.map(rel).join(", ")}`);
}

// 8. Workflow skills point at the core skill
for (const name of skillNames.filter((n) => !["fe-architecture", "fe"].includes(n))) {
  if (!read(path.join(skillsDir, name, "SKILL.md")).includes("`fe-architecture`")) fail("core-pointer", `${name}: does not load fe-architecture`);
}

// 9. Plugin manifest
const manifest = path.join(root, ".claude-plugin", "plugin.json");
if (!fs.existsSync(manifest)) fail("manifest", ".claude-plugin/plugin.json missing");
else { try { const j = JSON.parse(read(manifest)); if (!j.name || !j.version) fail("manifest", "plugin.json needs name and version"); } catch { fail("manifest", "plugin.json is not valid JSON"); } }


// 10. Installed layout: links and scanner work from a copy made by install.sh (the layout people actually use)
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fe skills "));
  const inst = spawnSync("bash", [path.join(root, "scripts", "install.sh"), tmp], { encoding: "utf8" });
  if (inst.status !== 0) fail("install", `install.sh exited ${inst.status}: ${inst.stderr}`);
  else {
    for (const file of walk(tmp).filter((f) => f.endsWith(".md"))) {
      const text = read(file).replace(/```[\s\S]*?```/g, "");
      for (const m of text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
        if (/^(https?:|mailto:)/.test(m[1])) continue;
        if (!fs.existsSync(path.resolve(path.dirname(file), m[1]))) fail("installed-links", `${path.relative(tmp, file)}: broken link ${m[1]} after install`);
      }
    }
    const scanner = path.join(tmp, "fe-architecture", "scripts", "fe-scan.mjs");
    const seeded = path.join(root, "evals", "fixtures", "react-seeded", "src");
    const run = spawnSync("node", [scanner, seeded, "--fail-on", "error"], { encoding: "utf8" });
    if (run.status !== 1 || !run.stdout.includes("import-cycle")) fail("installed-scanner", `installed scanner (path with spaces) exit ${run.status}, expected 1 with findings`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) { console.error(failures.join("\n")); console.error(`\n${failures.length} validation failure(s)`); process.exit(1); }
console.log(`ok: ${skillNames.length} skills, ${refFiles.length} references, ${mdFiles.length} markdown files validated`);
