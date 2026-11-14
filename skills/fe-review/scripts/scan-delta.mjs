#!/usr/bin/env node
// scan-delta: compare scanner findings between a base ref and the working tree without touching the worktree.
// Usage: node scan-delta.mjs <base-ref> --root <sourceRoot> [--json] [--fail-on error|warn|never]
// The ref is passed to git as a single argv element (no shell), validated, and resolved to a commit SHA first.
// The base is checked out in a temporary detached worktree that is always removed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scan, fingerprint } from "../../fe-architecture/scripts/fe-scan.mjs";

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8" });

export function resolveCommit(ref, cwd) {
  if (typeof ref !== "string" || ref === "" || ref.startsWith("-") || /[\s\x00-\x1f\x7f]/.test(ref)) throw new Error(`refusing ref ${JSON.stringify(ref)}: must be non-empty, not start with "-", and contain no whitespace or control characters`);
  const r = git(["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`], cwd);
  if (r.status !== 0) throw new Error(`"${ref}" is not a commit in this repository (does git support --end-of-options? it needs git 2.24+)`);
  return r.stdout.trim();
}

export function scanDelta({ baseRef, root, cwd = process.cwd(), now }) {
  const top = git(["rev-parse", "--show-toplevel"], cwd);
  if (top.status !== 0) throw new Error("not inside a git repository");
  // realpathSync.native expands Windows 8.3 short names (RUNNER~1) that git reports in long form.
  const repoRoot = fs.realpathSync.native(top.stdout.trim());
  const abs = fs.realpathSync.native(path.resolve(cwd, root));
  const relRoot = path.relative(repoRoot, abs);
  if (relRoot.startsWith("..")) throw new Error("source root is outside the repository");
  const base = resolveCommit(baseRef, repoRoot);
  const mb = git(["merge-base", base, "HEAD"], repoRoot);
  const mergeBase = mb.status === 0 ? mb.stdout.trim() : base;
  const diff = git(["diff", "--name-only", "-z", mergeBase, "--"], repoRoot);
  const changed = diff.stdout.split("\0").filter(Boolean);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fe-scan-delta-"));
  const wt = path.join(tmp, "base");
  let baseResult = null;
  try {
    const add = git(["worktree", "add", "--detach", wt, mergeBase], repoRoot);
    if (add.status !== 0) throw new Error(`could not create temporary worktree: ${add.stderr.trim()}`);
    const baseRoot = path.join(wt, relRoot);
    if (fs.existsSync(baseRoot)) baseResult = scan({ root: baseRoot, noConfig: false, now });
  } finally {
    git(["worktree", "remove", "--force", wt], repoRoot);
    fs.rmSync(tmp, { recursive: true, force: true });
    git(["worktree", "prune"], repoRoot);
  }
  const head = scan({ root: abs, now });
  const count = (r) => { const m = new Map(); for (const f of r?.findings ?? []) if (f.severity !== "info") m.set(fingerprint(f), (m.get(fingerprint(f)) ?? 0) + 1); return m; };
  const hc = count(head), bc = count(baseResult);
  const pick = (r, a, b) => { const seen = new Map(); return (r?.findings ?? []).filter((f) => { if (f.severity === "info") return false; const k = fingerprint(f); const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return n > (b.get(k) ?? 0); }); };
  const added = pick(head, hc, bc);
  const resolved = pick(baseResult, bc, hc);
  const coverage = (r) => (r ? { status: r.coverage.status, percent: r.coverage.percent, unresolved: r.unresolvedImports } : null);
  return { baseRef, base: base, mergeBase, changed, newFindings: added, resolvedFindings: resolved, headCoverage: coverage(head), baseCoverage: coverage(baseResult), baseMissing: !baseResult, limitations: head.limitations.map((l) => l.message) };
}

function main(argv) {
  let baseRef = null, root = null, json = false, failOn = "error";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") root = argv[++i];
    else if (a === "--json") json = true;
    else if (a === "--fail-on") failOn = argv[++i];
    else if (baseRef === null && !a.startsWith("--")) baseRef = a;
    else throw new Error(`unexpected argument ${JSON.stringify(a)}`);
  }
  if (!baseRef || !root) { console.error("usage: node scan-delta.mjs <base-ref> --root <sourceRoot> [--json] [--fail-on error|warn|never]"); return 2; }
  const r = scanDelta({ baseRef, root });
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    const line = (f) => `  [${f.severity}] ${f.rule} ${f.file ?? ""}${f.line ? ":" + f.line : ""}: ${f.message}`;
    console.log(`base ${r.base.slice(0, 12)} (merge base ${r.mergeBase.slice(0, 12)}), ${r.changed.length} changed file(s)`);
    console.log(`coverage: head ${r.headCoverage.status} ${r.headCoverage.percent}%${r.baseCoverage ? `, base ${r.baseCoverage.status} ${r.baseCoverage.percent}%` : ", base: source root absent at base"}`);
    console.log(`\nNEW (${r.newFindings.length})`); r.newFindings.forEach((f) => console.log(line(f)));
    console.log(`\nRESOLVED (${r.resolvedFindings.length})`); r.resolvedFindings.forEach((f) => console.log(line(f)));
    console.log("\nNOT CHECKED"); r.limitations.forEach((m) => console.log(`  - ${m}`));
    if (r.headCoverage.status === "partial") console.log("\nHead scan is PARTIAL: an empty NEW list does not mean no new violations.");
  }
  const bad = (failOn === "error" && r.newFindings.some((f) => f.severity === "error")) || (failOn === "warn" && r.newFindings.length);
  return bad ? 1 : 0;
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`scan-delta failed: ${e.message}`); process.exit(2); }
}
