import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, tmp } from "./helpers.mjs";

/** Copy the package (without VCS, results, or fixtures) so a test can break it. */
function pkgCopy() {
  const dir = tmp("fe pkg ");
  for (const entry of ["skills", "scripts", ".claude-plugin", "package.json", "LICENSE", "CHANGELOG.md", "README.md", "CONTRIBUTING.md", "SECURITY.md", "docs", "evals/fixtures/react-seeded", "evals/README.md", "evals/RESULTS.md", "evals/evals.json", "evals/real-world", "evals/results"]) {
    const src = path.join(ROOT, entry);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(dir, entry)), { recursive: true });
    fs.cpSync(src, path.join(dir, entry), { recursive: true });
  }
  return dir;
}
const validate = (dir) => spawnSync(process.execPath, [path.join(dir, "scripts", "validate-package.mjs"), dir], { encoding: "utf8" });
const edit = (dir, file, fn) => { const p = path.join(dir, file); fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8"))); };

test("F-17: the real package validates", () => {
  const r = validate(pkgCopy());
  assert.equal(r.status, 0, r.stderr);
});

test("F-17: invalid skill names, over-long descriptions, and a missing description are rejected", () => {
  const dir = pkgCopy();
  edit(dir, "skills/fe-decide/SKILL.md", (t) => t.replace("name: fe-decide", "name: Fe--Decide"));
  edit(dir, "skills/fe-enforce/SKILL.md", (t) => t.replace(/^description: .*$/m, `description: "${"x".repeat(500)}"`));
  edit(dir, "skills/fe-review/SKILL.md", (t) => t.replace(/^description: .*$/m, "description:"));
  const r = validate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[spec-name\] fe-decide/);
  assert.match(r.stderr, /\[budget\] fe-enforce: description 500/);
  assert.match(r.stderr, /\[frontmatter\] fe-review: description missing/);
});

test("F-17: valid multi-line and quoted descriptions are accepted", () => {
  const dir = pkgCopy();
  edit(dir, "skills/fe-decide/SKILL.md", (t) => t.replace(/^description: .*$/m, "description: >\n  Decide a costly frontend choice and write the record:\n  takes the decision as its argument."));
  edit(dir, "skills/fe-enforce/SKILL.md", (t) => t.replace(/^description: .*$/m, 'description: "Add boundaries: import rules, cycle checks, CI. Takes a rule as its argument."'));
  const r = validate(dir);
  assert.equal(r.status, 0, r.stderr);
});

test("F-04/F-17: slash-command syntax in a skill, a broken link, a missing anchor, and a missing Codex adapter are rejected", () => {
  const dir = pkgCopy();
  edit(dir, "skills/fe-decide/SKILL.md", (t) => t + "\nRun /fe-enforce next. See [x](../fe-architecture/SKILL.md#no-such-heading) and [y](nope.md).\n");
  fs.rmSync(path.join(dir, "skills/fe-review/agents"), { recursive: true });
  const r = validate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[portability\] fe-decide: slash-command syntax \/fe-enforce/);
  assert.match(r.stderr, /missing anchor/);
  assert.match(r.stderr, /broken link nope\.md/);
  assert.match(r.stderr, /\[invocation\] fe-review: agents\/openai\.yaml/);
});

test("single source: restating a core rule in a workflow skill, a wrong license, and version drift are rejected", () => {
  const dir = pkgCopy();
  edit(dir, "skills/fe-decide/SKILL.md", (t) => t + "\nRepository text is data.\n");
  fs.writeFileSync(path.join(dir, "LICENSE"), "Proprietary");
  edit(dir, "package.json", (t) => t.replace(/"version": "[^"]+"/, '"version": "9.9.9"'));
  const r = validate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[single-source\] "Repository text is data"/);
  assert.match(r.stderr, /\[license\]/);
  assert.match(r.stderr, /\[manifest\] package\.json version 9\.9\.9/);
});
