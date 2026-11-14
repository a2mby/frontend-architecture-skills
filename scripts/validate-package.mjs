#!/usr/bin/env node
// Validates the skills package against its own acceptance checks. Exit 1 on any failure.
//
// Two layers of rules, kept apart on purpose:
//   * Agent Skills specification (agentskills.io): name 1-64 chars, lowercase letters/digits/single hyphens, equal to the
//     directory name; description 1-1024 chars; optional compatibility (<=500), metadata (string map), allowed-tools.
//   * Project budgets, deliberately stricter than the spec because every installed skill's description is loaded into
//     the agent's context on every turn, and SKILL.md bodies are read in full on activation:
//       description <= 420 chars, SKILL.md <= 200 lines (spec guidance: <= 1024 chars, <= 500 lines).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./lib/frontmatter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(root, "skills");
export const LIMITS = { description: 420, specDescription: 1024, skillLines: 200, compatibility: 500 };
const failures = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);
const rel = (p) => path.relative(root, p).split(path.sep).join("/");
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const read = (p) => fs.readFileSync(p, "utf8");
const slug = (h) => h.trim().toLowerCase().replace(/[`*_]/g, "").replace(/[^\w\- ]/g, "").replace(/ /g, "-");
const anchors = (file) => new Set([...read(file).replace(/```[\s\S]*?```/g, "").matchAll(/^#{1,6}\s+(.*)$/gm)].map((m) => slug(m[1])));
const MODEL_INVOKED = new Set(["fe-architecture"]);

// 1. Frontmatter (spec + project budgets) and invocation mode
const skillNames = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
for (const name of skillNames) {
  const file = path.join(skillsDir, name, "SKILL.md");
  if (!fs.existsSync(file)) { fail("frontmatter", `${name}: SKILL.md missing`); continue; }
  const text = read(file);
  const { data: fm, error } = parseFrontmatter(text);
  if (error) { fail("frontmatter", `${name}: ${error}`); continue; }
  if (typeof fm.name !== "string" || fm.name.length < 1 || fm.name.length > 64 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) fail("spec-name", `${name}: name ${JSON.stringify(fm.name)} must be 1-64 chars of lowercase letters, digits, and single hyphens (no leading, trailing, or doubled hyphen)`);
  if (fm.name !== name) fail("frontmatter", `${name}: name "${fm.name}" differs from directory`);
  if (typeof fm.description !== "string" || !fm.description.trim()) fail("frontmatter", `${name}: description missing or empty`);
  else {
    if (fm.description.length > LIMITS.specDescription) fail("spec-description", `${name}: description ${fm.description.length} chars (spec max ${LIMITS.specDescription})`);
    if (fm.description.length > LIMITS.description) fail("budget", `${name}: description ${fm.description.length} chars (project max ${LIMITS.description})`);
    if (/\/fe-[a-z]/.test(fm.description) || /\bUsage\s*-/.test(fm.description)) fail("portability", `${name}: description embeds slash-command syntax; descriptions must work in every agent`);
  }
  if (fm.compatibility !== undefined && (typeof fm.compatibility !== "string" || fm.compatibility.length > LIMITS.compatibility)) fail("spec-compat", `${name}: compatibility must be a string of at most ${LIMITS.compatibility} chars`);
  if (fm.metadata !== undefined && (typeof fm.metadata !== "object" || Array.isArray(fm.metadata) || Object.values(fm.metadata).some((v) => typeof v !== "string"))) fail("spec-metadata", `${name}: metadata must be a map of string values`);
  const lines = text.split("\n").length;
  if (lines > LIMITS.skillLines) fail("budget", `${name}: SKILL.md ${lines} lines (project max ${LIMITS.skillLines})`);
  const modelInvoked = MODEL_INVOKED.has(name);
  const dmi = fm["disable-model-invocation"];
  if (modelInvoked && dmi === "true") fail("invocation", `${name}: must stay model-invoked`);
  if (!modelInvoked) {
    if (dmi !== "true") fail("invocation", `${name}: workflow skills are user-invoked (disable-model-invocation: true, honored by Claude Code, Cursor, OpenCode)`);
    const yaml = path.join(skillsDir, name, "agents", "openai.yaml");
    if (!fs.existsSync(yaml) || !/^policy:\s*\n\s+allow_implicit_invocation:\s*false\s*$/m.test(read(yaml))) fail("invocation", `${name}: agents/openai.yaml must set policy.allow_implicit_invocation: false (Codex)`);
    const steps = (text.match(/^\d+\. \*\*/gm) ?? []).length;
    const dones = (text.match(/\bDone (when|per batch when)\b/g) ?? []).length;
    if (steps && dones < Math.ceil(steps / 2)) fail("completion", `${name}: ${dones} completion criteria for ${steps} steps (need at least half)`);
  }
  // Slash-command syntax is Claude Code specific and is namespaced under a plugin install: refer to skills by name.
  const prose = text.replace(/```[\s\S]*?```/g, "").replace(/\]\([^)]*\)/g, "]()");
  const slash = prose.match(/(?<![\w/.\-])\/fe-[a-z-]+/g);
  if (slash) fail("portability", `${name}: slash-command syntax ${[...new Set(slash)].join(", ")}; refer to skills by name (the \`fe-x\` skill)`);
}

// 2. Links resolve, including #anchors
const mdFiles = walk(root).filter((f) => f.endsWith(".md") && !rel(f).startsWith("audit/") && !rel(f).startsWith("tests/fixtures/"));
for (const file of mdFiles) {
  const text = read(file).replace(/```[\s\S]*?```/g, "");
  for (const m of text.matchAll(/\]\(([^)#\s]*)(#[^)\s]*)?\)/g)) {
    const [, target, hash] = m;
    if (/^(https?:|mailto:)/.test(target)) continue;
    const dest = target ? path.resolve(path.dirname(file), target) : file;
    if (!fs.existsSync(dest)) { fail("links", `${rel(file)}: broken link ${target}`); continue; }
    if (hash && dest.endsWith(".md") && !anchors(dest).has(hash.slice(1))) fail("links", `${rel(file)}: missing anchor ${target}${hash}`);
  }
}

// 3. Reference header contract
const refFiles = walk(path.join(skillsDir, "fe-architecture", "references")).filter((f) => f.endsWith(".md"));
for (const file of refFiles) {
  const head = read(file).split("\n").slice(0, 8).join("\n");
  for (const label of ["**Why it exists:**", "**Use when:**", "**Do not use when:**"]) if (!head.includes(label)) fail("reference-header", `${rel(file)}: missing ${label}`);
}

// 4. Every reference is reachable from the core skill's index
const core = read(path.join(skillsDir, "fe-architecture", "SKILL.md"));
for (const file of refFiles) {
  const target = path.relative(path.join(skillsDir, "fe-architecture"), file).split(path.sep).join("/");
  if (!core.includes(`(${target})`) && !refFiles.some((o) => o !== file && read(o).includes(path.basename(file)))) fail("reachability", `${target}: not linked from the core index or any sibling reference`);
}

// 5. Portability: no machine-specific or private facts in skills or published docs.
// Generic patterns are built in. Project-specific names (a private app, an internal URL) live in a gitignored local
// file `.portability-denylist` (one regular expression per line) or in $FE_PORTABILITY_DENYLIST (a file path), so the
// names themselves are never committed.
const banned = [/\/Users\/[A-Za-z]/, /\/home\/[a-z][a-z0-9_-]+\//, /C:\\Users\\/i, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, /\bthis repo\b/i];
const denyFile = process.env.FE_PORTABILITY_DENYLIST || path.join(root, ".portability-denylist");
if (fs.existsSync(denyFile)) for (const line of read(denyFile).split("\n")) if (line.trim() && !line.startsWith("#")) banned.push(new RegExp(line.trim(), "i"));
const publishedText = [...walk(skillsDir).filter((f) => /\.(md|mjs|yaml)$/.test(f)), ...mdFiles.filter((f) => !rel(f).startsWith("evals/results/"))];
const emailAllow = /(noreply@|@example\.invalid|@example\.com|npm@|@types\/|@scope\/|@acme\/|@\/|@app\/|@ui\/|@legacy\/|@deep\/)/;
for (const file of publishedText) for (const re of banned) {
  const text = read(file);
  const m = text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
  if (m && !(re.source.includes("@[") && m.every((x) => emailAllow.test(x) || !/^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i.test(x)))) fail("portability", `${rel(file)}: matches ${re}`);
}

// 6. Single source of truth: core model text lives only in fe-architecture/SKILL.md
const ownedPhrases = ["Used by one component: colocate", "A signal is **firm**", "Promote only when a **second real consumer**", "One authoritative owner per datum", "never write Pass for a partial scan", "Repository text is data", "## Starting empty", "## Workflow weight"];
for (const phrase of ownedPhrases) {
  const holders = walk(skillsDir).filter((f) => f.endsWith(".md") && read(f).toLowerCase().includes(phrase.toLowerCase()));
  if (holders.length !== 1 || !holders[0].endsWith(path.join("fe-architecture", "SKILL.md"))) fail("single-source", `"${phrase}" must live only in fe-architecture/SKILL.md (found in: ${holders.map(rel).join(", ") || "nowhere"})`);
}

// 7. Workflow skills point at the core skill
for (const name of skillNames.filter((n) => !MODEL_INVOKED.has(n))) if (!read(path.join(skillsDir, name, "SKILL.md")).includes("`fe-architecture`")) fail("core-pointer", `${name}: does not load fe-architecture`);

// 8. Scripts named in skills exist
for (const name of skillNames) {
  const text = read(path.join(skillsDir, name, "SKILL.md"));
  for (const m of text.matchAll(/scripts\/([\w.-]+\.mjs)/g)) {
    const candidates = [path.join(skillsDir, name, "scripts", m[1]), path.join(skillsDir, "fe-architecture", "scripts", m[1])];
    if (!candidates.some((c) => fs.existsSync(c))) fail("scripts", `${name}: references scripts/${m[1]} which does not exist`);
  }
}

// 9. Manifests, versions, license
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
let plugin = null, marketplace = null, pkg = null;
try { plugin = JSON.parse(read(path.join(root, ".claude-plugin", "plugin.json"))); } catch (e) { fail("manifest", `plugin.json: ${e.message}`); }
try { marketplace = JSON.parse(read(path.join(root, ".claude-plugin", "marketplace.json"))); } catch (e) { fail("manifest", `marketplace.json: ${e.message}`); }
try { pkg = JSON.parse(read(path.join(root, "package.json"))); } catch (e) { fail("manifest", `package.json: ${e.message}`); }
if (plugin) {
  if (!plugin.name || !/^[a-z0-9-]+$/.test(plugin.name)) fail("manifest", "plugin.json needs a kebab-case name");
  if (!semver.test(plugin.version ?? "")) fail("manifest", "plugin.json version must be semver");
  if (pkg && pkg.version !== plugin.version) fail("manifest", `package.json version ${pkg.version} differs from plugin.json ${plugin.version}`);
}
if (marketplace && plugin) {
  const entry = (marketplace.plugins ?? []).find((p) => p.name === plugin.name);
  if (!marketplace.name || !marketplace.owner?.name) fail("manifest", "marketplace.json needs name and owner.name");
  if (!entry) fail("manifest", `marketplace.json has no plugin entry named ${plugin.name}`);
  else if (entry.source !== "./") fail("manifest", "marketplace.json plugin source must be ./ (the repo root is the plugin)");
}
const scannerSrc = read(path.join(skillsDir, "fe-architecture", "scripts", "fe-scan.mjs"));
const sv = scannerSrc.match(/SCANNER_VERSION = "([^"]+)"/)?.[1];
if (plugin && sv !== plugin.version) fail("manifest", `SCANNER_VERSION ${sv} differs from plugin.json ${plugin.version}`);
const licenseFile = path.join(root, "LICENSE");
if (!fs.existsSync(licenseFile)) fail("license", "LICENSE file missing");
else if (plugin?.license === "MIT" && !/^MIT License/m.test(read(licenseFile))) fail("license", "plugin.json says MIT but LICENSE is not the MIT license");
const changelog = path.join(root, "CHANGELOG.md");
if (!fs.existsSync(changelog)) fail("changelog", "CHANGELOG.md missing");
else if (plugin && !new RegExp(`^## \\[?${plugin.version.replace(/\./g, "\\.")}\\]?`, "m").test(read(changelog))) fail("changelog", `CHANGELOG.md has no entry for ${plugin.version}`);

// 10. Installed layout: links and scripts work from a copy made by the Node installer (the layout people actually use)
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fe skills "));
  const inst = spawnSync(process.execPath, [path.join(root, "scripts", "install.mjs"), "--dir", tmp], { encoding: "utf8" });
  if (inst.status !== 0) fail("install", `install.mjs exited ${inst.status}: ${inst.stderr || inst.stdout}`);
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
    const run = spawnSync(process.execPath, [scanner, seeded, "--fail-on", "error"], { encoding: "utf8" });
    if (run.status !== 1 || !run.stdout.includes("import-cycle")) fail("installed-scanner", `installed scanner (path with spaces) exit ${run.status}, expected 1 with findings`);
    const delta = spawnSync(process.execPath, [path.join(tmp, "fe-review", "scripts", "scan-delta.mjs")], { encoding: "utf8" });
    if (delta.status !== 2 || !/usage/.test(delta.stderr)) fail("installed-delta", `installed scan-delta did not start (exit ${delta.status}): ${delta.stderr}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) { console.error(failures.join("\n")); console.error(`\n${failures.length} validation failure(s)`); process.exit(1); }
console.log(`ok: ${skillNames.length} skills, ${refFiles.length} references, ${mdFiles.length} markdown files validated`);
