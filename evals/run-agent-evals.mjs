#!/usr/bin/env node
// Agent-driven eval runner. Needs the `claude` CLI (authenticated); spends money; never run in CI by default.
//   node evals/run-agent-evals.mjs [--case id]... [--trials N] [--model sonnet] [--budget 1.5] [--list] [--markdown file]
// Each trial: copy the fixture to a fresh temp dir, install the skills project-locally, snapshot the tree, run
// `claude -p`, snapshot again, then verify the machine-checkable `checks` from evals.json. Results (model, CLI version,
// date, per-check outcome, cost) are appended to evals/results/<timestamp>.json. Nothing here edits this repository.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scan, globToRegExp } from "../skills/fe-architecture/scripts/fe-scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const cases = JSON.parse(fs.readFileSync(path.join(here, "evals.json"), "utf8")).cases;

const args = process.argv.slice(2);
const opt = { cases: [], trials: null, model: "sonnet", budget: 2, list: false, markdown: null, timeout: 900 };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--case") opt.cases.push(args[++i]);
  else if (a === "--trials") opt.trials = Number(args[++i]);
  else if (a === "--model") opt.model = args[++i];
  else if (a === "--budget") opt.budget = Number(args[++i]);
  else if (a === "--markdown") opt.markdown = args[++i];
  else if (a === "--timeout") opt.timeout = Number(args[++i]);
  else if (a === "--list") opt.list = true;
  else { console.error(`unknown argument ${a}`); process.exit(2); }
}
if (opt.list) { for (const c of cases) console.log(`${c.id}\t${c.skill}\t${c.scenario}\t${c.kind}\ttrials=${c.trials}`); process.exit(0); }
const version = spawnSync("claude", ["--version"], { encoding: "utf8" });
if (version.status !== 0) { console.error("claude CLI not found: agent evals cannot run here. Deterministic tests: npm test."); process.exit(2); }
const cliVersion = version.stdout.trim();
// Skills from the user's own directories would contaminate a trial.
const home = os.homedir();
for (const d of [path.join(home, ".claude", "skills")]) if (fs.existsSync(d) && fs.readdirSync(d).some((n) => n.startsWith("fe-"))) { console.error(`refusing to run: ${d} already contains fe-* skills`); process.exit(2); }

const SKIP = new Set([".claude", ".git", "node_modules"]);
function snapshot(dir, base = dir, out = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) snapshot(p, base, out);
    else out[path.relative(base, p).split(path.sep).join("/")] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
  }
  return out;
}
const diff = (a, b) => ({ added: Object.keys(b).filter((k) => !(k in a)), removed: Object.keys(a).filter((k) => !(k in b)), modified: Object.keys(b).filter((k) => k in a && a[k] !== b[k]) });
const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8" });
const git = (cwd, ...a) => sh("git", ["-c", "user.name=eval", "-c", "user.email=eval@example.invalid", "-c", "commit.gpgsign=false", ...a], cwd);
const scanErrors = (work, rule, file) => { try { const r = scan({ root: path.join(work, "src") }); return r.findings.filter((f) => f.severity === "error" && (!rule || f.rule === rule) && (!file || (f.file ?? "").startsWith(file))).length; } catch { return null; } };

const SETUPS = {
  "review-branch": (work) => {
    git(work, "init", "-q", "-b", "main"); git(work, "add", "-A"); git(work, "commit", "-qm", "base");
    git(work, "checkout", "-qb", "feature");
    fs.writeFileSync(path.join(work, "src/features/search/index.ts"), "import { price } from '@/features/cart/internal/price';\nexport const s = price(1);\n");
    git(work, "commit", "-qam", "search uses cart internals");
  },
};

function parseStream(stdout) {
  const events = stdout.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const result = events.find((e) => e.type === "result") ?? {};
  const skills = new Set(), reads = [];
  for (const e of events) for (const b of e.message?.content ?? []) {
    if (b.type === "tool_use" && b.name === "Skill") skills.add(String(b.input?.skill ?? b.input?.name ?? "").replace(/^.*:/, ""));
    if (b.type === "tool_use" && b.name === "Read") reads.push(String(b.input?.file_path ?? ""));
  }
  for (const r of reads) { const m = r.match(/skills\/(fe-[a-z-]+)\/SKILL\.md/); if (m) skills.add(m[1]); }
  // A slash-invoked skill shows up as a tool result "Launching skill: <name>" in the stream.
  for (const m of stdout.matchAll(/Launching skill: (fe-[a-z-]+)/g)) skills.add(m[1]);
  const init = events.find((e) => e.type === "system" && e.subtype === "init") ?? {};
  const registered = new Set([...(init.slash_commands ?? []), ...(init.skills ?? [])].map((n) => String(n).replace(/^.*:/, "")));
  return { registered, text: String(result.result ?? ""), cost: result.total_cost_usd ?? null, turns: result.num_turns ?? null, isError: !!result.is_error, skills: [...skills] };
}

function runCheck(chk, ctx) {
  const { before, after, changes, work, run, case: c } = ctx;
  const out = (pass, detail) => ({ type: chk.type, pass, detail });
  switch (chk.type) {
    case "no-files-changed": { const n = changes.added.length + changes.removed.length + changes.modified.length; return out(n === 0, n ? `changed: ${[...changes.added, ...changes.removed, ...changes.modified].slice(0, 6).join(", ")}` : ""); }
    case "changes-within": { const res = chk.globs.map(globToRegExp); const bad = [...changes.added, ...changes.removed, ...changes.modified].filter((f) => !res.some((r) => r.test(f))); return out(!bad.length, bad.slice(0, 6).join(", ")); }
    case "no-new-files-matching": { const res = chk.globs.map(globToRegExp); const bad = changes.added.filter((f) => res.some((r) => r.test(f))); return out(!bad.length, bad.join(", ")); }
    case "new-file-count-at-most": return out(changes.added.length <= chk.max, `${changes.added.length} new files`);
    case "output-matches": return out(new RegExp(chk.regex, chk.flags ?? "").test(run.text), chk.regex);
    case "output-not-matches": return out(!new RegExp(chk.regex, chk.flags ?? "").test(run.text), chk.regex);
    case "skill-used": {
      // A slash-invoked workflow is expanded before the first model turn and is not echoed in the stream. Evidence used instead:
      // the skill is registered in the session, and the agent then loaded the core skill the workflow tells it to load.
      const direct = run.skills.includes(chk.skill);
      const viaSlash = c.prompt.startsWith("/" + chk.skill) && run.registered.has(chk.skill) && run.skills.includes("fe-architecture");
      return out(direct || viaSlash, `${direct ? "loaded by tool" : viaSlash ? "slash-invoked, registered, core skill loaded" : "no evidence"}; skills seen: ${run.skills.join(", ") || "none"}`);
    }
    case "file-absent": return out(!fs.existsSync(path.join(work, chk.path)) && !fs.existsSync(path.join(path.dirname(work), chk.path)), chk.path);
    case "file-exists": return out(fs.existsSync(path.join(work, chk.path)), chk.path);
    case "file-contains": { const f = path.join(work, chk.path); return out(fs.existsSync(f) && new RegExp(chk.regex, chk.flags ?? "").test(fs.readFileSync(f, "utf8")), chk.path); }
    case "scan-errors-not-higher": { const a = scanErrors(work); return out(a !== null && a <= ctx.scanBefore, `before ${ctx.scanBefore}, after ${a}`); }
    case "scan-rule-max": { const n = scanErrors(work, chk.rule, chk.file); return out(n !== null && n <= chk.max, `${chk.rule}${chk.file ? " in " + chk.file : ""}: ${n}`); }
    case "git-unchanged": {
      const status = git(work, "status", "--porcelain").stdout.trim(), head = git(work, "rev-parse", "HEAD").stdout.trim(), br = git(work, "branch", "--show-current").stdout.trim();
      const wt = git(work, "worktree", "list").stdout.trim().split("\n").length, stash = git(work, "stash", "list").stdout.trim();
      const ok = status === ctx.gitBefore.status && head === ctx.gitBefore.head && br === ctx.gitBefore.branch && wt === 1 && stash === "";
      return out(ok, `status=${JSON.stringify(status)} branch=${br} worktrees=${wt} stash=${JSON.stringify(stash)}`);
    }
    case "npm-script-gate": {
      const clean = sh("npm", ["run", chk.script, "--silent"], work);
      const f = path.join(work, chk.inject.file);
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, chk.inject.content);
      const bad = sh("npm", ["run", chk.script, "--silent"], work);
      fs.rmSync(f);
      return out(clean.status === 0 && bad.status !== 0, `clean exit ${clean.status}, with injected violation exit ${bad.status}`);
    }
    case "no-invented-paths": {
      const existing = Object.keys(before);
      const lines = run.text.split("\n");
      const invented = [];
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/(?<![\w@])((?:[\w@.-]+\/)+[\w.-]+\.(?:tsx?|jsx?|vue|svelte|css|json))/g)) {
          const p = m[1].replace(/^\.\//, "").replace(/^@\//, "src/");
          if (existing.some((e) => e === p || e.endsWith("/" + p) || p.endsWith("/" + e))) continue;
          let ctxLines = line;
          for (let j = i - 1; j >= 0 && j >= i - 6; j--) { ctxLines += "\n" + lines[j]; if (/^\s*#/.test(lines[j])) break; }
          if (!/propos|\bnew\b|\bcreate|\badd(ed)?\b|\bwould\b/i.test(ctxLines)) invented.push(p);
        }
      });
      return out(!invented.length, invented.length ? `unlabeled non-existent paths: ${[...new Set(invented)].slice(0, 6).join(", ")}` : "every non-existent path is labeled proposed/new");
    }
    default: return out(false, `unknown check ${chk.type}`);
  }
}

const selected = cases.filter((c) => !opt.cases.length || opt.cases.includes(c.id));
if (!selected.length) { console.error("no matching case"); process.exit(2); }
const results = [];
const started = new Date();
for (const c of selected) {
  const trials = opt.trials ?? c.trials ?? 1;
  for (let t = 1; t <= trials; t++) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), `fe-eval-${c.id}-`));
    fs.cpSync(path.join(here, "fixtures", c.fixture), work, { recursive: true });
    if (!fs.existsSync(path.join(work, "AGENTS.md")) && false) fs.writeFileSync(path.join(work, "AGENTS.md"), "");
    const inst = spawnSync(process.execPath, [path.join(repo, "scripts", "install.mjs"), "--dir", path.join(work, ".claude", "skills")], { encoding: "utf8" });
    if (inst.status !== 0) { console.error(inst.stderr); process.exit(2); }
    if (c.setup) SETUPS[c.setup](work);
    const before = snapshot(work), scanBefore = scanErrors(work);
    const gitBefore = c.setup ? { status: git(work, "status", "--porcelain").stdout.trim(), head: git(work, "rev-parse", "HEAD").stdout.trim(), branch: git(work, "branch", "--show-current").stdout.trim() } : null;
    const cliArgs = ["-p", c.prompt, "--model", opt.model, "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--max-budget-usd", String(opt.budget)];
    if (c.kind === "mutating") cliArgs.push("--permission-mode", "acceptEdits", "--allowedTools", "Read", "Glob", "Grep", "Skill", "Edit", "Write", "Bash(node:*)", "Bash(npm:*)", "Bash(git:*)", "Bash(ls:*)", "Bash(cp:*)", "Bash(mkdir:*)", "Bash(cat:*)", "Bash(rm:*)");
    else cliArgs.push("--disallowedTools", "Edit", "Write", "NotebookEdit", "--allowedTools", "Read", "Glob", "Grep", "Skill", "Bash(node:*)", "Bash(git:*)", "Bash(ls:*)", "Bash(cat:*)");
    const t0 = Date.now();
    const p = spawnSync("claude", cliArgs, { cwd: work, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: opt.timeout * 1000 });
    const run = parseStream(p.stdout ?? "");
    const after = snapshot(work), changes = diff(before, after);
    const ctx = { before, after, changes, work, run, case: c, scanBefore, gitBefore };
    const checks = c.checks.map((chk) => runCheck(chk, ctx));
    const passed = checks.filter((x) => x.pass).length;
    const rec = { case: c.id, skill: c.skill, scenario: c.scenario, kind: c.kind, trial: t, model: opt.model, cliVersion, date: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), cost: run.cost, turns: run.turns, agentError: run.isError || p.status !== 0, skillsSeen: run.skills, checks, passed, total: checks.length, changed: changes, finalText: run.text.slice(0, 8000), workdir: work };
    results.push(rec);
    console.log(`${c.id} trial ${t}: ${passed}/${checks.length} checks${rec.agentError ? " (agent error)" : ""}  $${run.cost ?? "?"}  ${rec.seconds}s`);
    for (const x of checks.filter((k) => !k.pass)) console.log(`   FAIL ${x.type}: ${x.detail}`);
  }
}
fs.mkdirSync(path.join(here, "results"), { recursive: true });
const file = path.join(here, "results", `${started.toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify({ started: started.toISOString(), model: opt.model, cliVersion, isolation: "fresh temp copy of the fixture per trial; skills installed project-locally; user-level settings, CLAUDE.md and plugins of the host were NOT isolated", results }, null, 2));
console.log(`\nresults: ${path.relative(repo, file)}`);
const byCase = new Map();
for (const r of results) byCase.set(r.case, [...(byCase.get(r.case) ?? []), r]);
const md = ["| Case | Skill | Scenario | Trials | Trials with all checks passing | Checks passed |", "| --- | --- | --- | --- | --- | --- |"];
for (const [id, rs] of byCase) md.push(`| ${id} | ${rs[0].skill} | ${rs[0].scenario} | ${rs.length} | ${rs.filter((r) => r.passed === r.total && !r.agentError).length}/${rs.length} | ${rs.reduce((a, r) => a + r.passed, 0)}/${rs.reduce((a, r) => a + r.total, 0)} |`);
console.log("\n" + md.join("\n"));
if (opt.markdown) fs.writeFileSync(opt.markdown, md.join("\n") + "\n");
