#!/usr/bin/env node
// Reproduces the recorded public-repo scan: fetches the pinned commit into a fresh empty temp directory (no install,
// no project scripts are ever run), scans the source root, and compares with the expectations in bulletproof-react.json.
//   node evals/real-world/reproduce.mjs [--keep]      needs git and network access to github.com
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scan, parseArgs } from "../../skills/fe-architecture/scripts/fe-scan.mjs";

const spec = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "bulletproof-react.json"), "utf8"));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fe-real-world-"));
const git = (...a) => { const r = spawnSync("git", a, { cwd: dir, encoding: "utf8" }); if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
let failed = 0;
try {
  git("init", "-q"); git("remote", "add", "origin", spec.repo);
  git("fetch", "-q", "--depth", "1", "origin", spec.commit); git("-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD");
  if (git("rev-parse", "HEAD") !== spec.commit) throw new Error("fetched commit differs from the pinned one");
  console.log(`${spec.repo} @ ${spec.commit} (${spec.commitDate})`);
  for (const run of spec.runs) {
    const opts = parseArgs([path.join(dir, spec.sourceRoot), ...run.scannerArgs]);
    const r = scan(opts), e = run.expect;
    const rules = {};
    for (const f of r.findings) rules[f.rule] = (rules[f.rule] ?? 0) + 1;
    const checks = [
      ["coverage", r.coverage.status === e.coverage && r.coverage.percent === e.percent],
      ["errors", r.counts.error === e.errors], ["warns", r.counts.warn === e.warns], ["infos", r.counts.info === e.infos],
      ["rules", JSON.stringify(Object.entries(rules).sort()) === JSON.stringify(Object.entries(e.rules).sort())],
      ["error sources", !e.errorSourcesAllUnder || r.findings.filter((f) => f.severity === "error").every((f) => f.file.startsWith(e.errorSourcesAllUnder))],
    ];
    const bad = checks.filter(([, ok]) => !ok).map(([n]) => n);
    console.log(`${bad.length ? "MISMATCH" : "ok      "} ${run.name}: ${r.counts.error} error, ${r.counts.warn} warn, ${r.counts.info} info, coverage ${r.coverage.status} ${r.coverage.percent}%${bad.length ? "  (differs: " + bad.join(", ") + ")" : ""}`);
    if (bad.length) failed++;
  }
} catch (e) { console.error(`reproduce failed: ${e.message}`); failed++; }
finally { if (!process.argv.includes("--keep")) fs.rmSync(dir, { recursive: true, force: true }); else console.log(`kept ${dir}`); }
process.exit(failed ? 1 : 0);
