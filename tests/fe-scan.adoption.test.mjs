import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scan } from "../skills/fe-architecture/scripts/fe-scan.mjs";
import { tmp, write, cli, ALIAS } from "./helpers.mjs";

const rules = (r) => r.findings.map((f) => f.rule);

/** A legacy app shaped like the audit's App A: many deep imports across capabilities. */
function legacyApp(deepImports = 83) {
  const files = { "tsconfig.json": ALIAS, "src/features/cart/index.ts": "export {};" };
  for (let i = 0; i < deepImports; i++) files[`src/features/cart/internal/p${i}.ts`] = `export const p${i} = ${i};`;
  for (let i = 0; i < deepImports; i++) files[`src/features/consumer${i % 9}/use${i}.ts`] = `import { p${i} } from "@/features/cart/internal/p${i}"; export const u${i} = p${i};`;
  for (let c = 0; c < 9; c++) files[`src/features/consumer${c}/index.ts`] = "export {};";
  return write(tmp("fe-legacy-"), files);
}

test("F-06: 83 existing deep imports baseline, CI passes, a new violation fails", () => {
  const dir = legacyApp(83);
  const src = path.join(dir, "src"), baseline = path.join(dir, "fe-scan.baseline.json");
  assert.equal(cli([src]).status, 1, "without a baseline the legacy app fails");
  const w = cli([src, "--write-baseline", baseline]);
  assert.equal(w.status, 0, w.stdout + w.stderr);
  const entries = JSON.parse(fs.readFileSync(baseline, "utf8")).entries;
  assert.equal(entries.length, 83);
  assert.ok(entries.every((e) => e.reason && e.rule === "deep-import"));
  const ok = cli([src, "--baseline", baseline]);
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /83 baselined/);
  assert.match(ok.stdout, /known debt, not passes/);
  // introduce one new violation
  write(dir, { "src/features/consumer0/new.ts": 'import { p1 } from "@/features/cart/internal/p1"; export const n = p1;' });
  const bad = cli([src, "--baseline", baseline]);
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stdout, /consumer0\/new\.ts/);
});

test("F-06: baseline is count-aware: a second identical violation in the same file is new", () => {
  const dir = write(tmp(), {
    "tsconfig.json": ALIAS,
    "src/features/cart/index.ts": "export {};", "src/features/cart/internal/p.ts": "export const p=1;",
    "src/features/checkout/index.ts": "import { p } from '@/features/cart/internal/p'; export const x = p;",
  });
  const src = path.join(dir, "src"), b = path.join(dir, "b.json");
  cli([src, "--write-baseline", b]);
  assert.equal(cli([src, "--baseline", b]).status, 0);
  fs.appendFileSync(path.join(src, "features/checkout/index.ts"), "\nimport { p as q } from '@/features/cart/internal/p'; export const y = q;");
  assert.equal(cli([src, "--baseline", b]).status, 1);
});

test("F-06: fixed violations leave stale baseline entries, which are reported and dropped on rewrite", () => {
  const dir = legacyApp(3);
  const src = path.join(dir, "src"), b = path.join(dir, "b.json");
  cli([src, "--write-baseline", b]);
  fs.rmSync(path.join(src, "features/consumer0/use0.ts"));
  const r = scan({ root: src, baseline: b });
  assert.ok(rules(r).includes("stale-baseline"));
  assert.equal(r.baseline.stale, 1);
  cli([src, "--write-baseline", b]);
  assert.equal(JSON.parse(fs.readFileSync(b, "utf8")).entries.length, 2);
  assert.ok(!rules(scan({ root: src, baseline: b })).includes("stale-baseline"));
});

test("F-06: write-baseline preserves hand-written reasons and expiry", () => {
  const dir = legacyApp(2);
  const src = path.join(dir, "src"), b = path.join(dir, "b.json");
  cli([src, "--write-baseline", b]);
  const j = JSON.parse(fs.readFileSync(b, "utf8"));
  j.entries[0].reason = "legacy, tracked in TICKET-1"; j.entries[0].expires = "2099-01-01";
  fs.writeFileSync(b, JSON.stringify(j));
  cli([src, "--write-baseline", b]);
  const again = JSON.parse(fs.readFileSync(b, "utf8")).entries.find((e) => e.reason.includes("TICKET-1"));
  assert.equal(again.expires, "2099-01-01");
});

test("F-06: an exception without a reason is rejected; an expired one resurfaces as an error", () => {
  const dir = legacyApp(2);
  const src = path.join(dir, "src");
  const entry = { rule: "deep-import", file: "features/consumer0/use0.ts", target: "features/cart/internal/p0.ts" };
  write(dir, { "noreason.json": { entries: [entry] } });
  const bad = cli([src, "--baseline", path.join(dir, "noreason.json")]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /no reason/);
  write(dir, { "expired.json": { entries: [{ ...entry, reason: "temporary", expires: "2020-01-01" }] } });
  const r = scan({ root: src, baseline: path.join(dir, "expired.json") });
  assert.ok(rules(r).includes("exception-expired"));
  assert.ok(rules(r).includes("deep-import"), "an expired exception no longer suppresses the violation");
  write(dir, { "valid.json": { entries: [{ ...entry, reason: "temporary", expires: "2099-01-01" }] } });
  const ok = scan({ root: src, baseline: path.join(dir, "valid.json") });
  assert.equal(ok.counts.suppressed, 1);
});

test("F-06: config exceptions need a reason; a missing baseline file is an error, not silence", () => {
  const dir = legacyApp(1);
  const src = path.join(dir, "src");
  write(dir, { "fe-scan.config.json": { exceptions: [{ rule: "deep-import", file: "x.ts" }] } });
  assert.equal(cli([src]).status, 2);
  assert.equal(cli([src, "--no-config", "--baseline", path.join(dir, "nope.json")]).status, 2);
});

test("F-06: ignore globs skip generated files as sources but keep them resolvable; cycles through them vanish", () => {
  const dir = write(tmp(), {
    "src/components/ui/Button.ts": "import { v } from '.'; export const Button = v;",
    "src/components/ui/index.ts": "export { Button } from './Button'; export const v = 1;",
    "src/features/a/index.ts": "import { Button } from '../../components/ui'; export const a = Button;",
  });
  const src = path.join(dir, "src");
  assert.ok(rules(scan({ root: src })).includes("import-cycle"));
  const r = scan({ root: src, ignore: ["components/ui/**"] });
  assert.ok(!rules(r).includes("import-cycle"));
  assert.equal(r.unresolvedImports, 0);
  write(dir, { "fe-scan.config.json": { ignore: ["**/ui/"] } });
  assert.ok(!rules(scan({ root: src })).includes("import-cycle"), "config ignore works the same");
});

test("F-06: config can turn a rule off or change its severity", () => {
  const dir = write(tmp(), {
    "src/features/a/index.ts": "export const a = 1;\n".repeat(500),
    "fe-scan.config.json": { rules: { "large-file": "off" } },
  });
  assert.ok(!rules(scan({ root: path.join(dir, "src") })).includes("large-file"));
});

test("F-20: root-only is the default; sub-barrels via flag, config, or declared public entries", () => {
  const files = {
    "src/features/cart/index.ts": "export {};",
    "src/features/cart/types/index.ts": "export type T = 1;",
    "src/features/cart/api/client.ts": "export const c = 1;",
    "src/features/checkout/index.ts": "import type { T } from '../cart/types'; import { c } from '../cart/api/client'; export type X = [T, typeof c];",
  };
  const dir = write(tmp(), files);
  const src = path.join(dir, "src");
  assert.equal(scan({ root: src }).findings.filter((f) => f.rule === "deep-import").length, 2);
  const sub = scan({ root: src, entryPolicy: "subbarrels" });
  assert.deepEqual(sub.findings.filter((f) => f.rule === "deep-import").map((f) => f.target), ["features/cart/api/client.ts"]);
  const declared = write(tmp(), { ...files, "fe-scan.config.json": { entryPolicy: "declared", publicEntries: ["features/*/api/client.ts", "features/*/index.ts"] } });
  const d = scan({ root: path.join(declared, "src") });
  assert.deepEqual(d.findings.filter((f) => f.rule === "deep-import").map((f) => f.target), ["features/cart/types/index.ts"]);
  assert.equal(d.entryPolicy.policy, "declared");
  assert.throws(() => scan({ root: src, entryPolicy: "declared" }), /publicEntries/);
  assert.throws(() => scan({ root: src, entryPolicy: "bogus" }), /unknown entry policy/);
});

test("F-20: a repo that consistently imports through folder barrels is detected, not condemned, and says so", () => {
  const files = { "src/features/cart/index.ts": "export {};" };
  for (let i = 0; i < 4; i++) {
    files[`src/features/cart/part${i}/index.ts`] = `export const v${i} = ${i};`;
    files[`src/features/user${i}/index.ts`] = `import { v${i} } from '../cart/part${i}'; export const u = v${i};`;
  }
  const r = scan({ root: path.join(write(tmp(), files), "src") });
  assert.equal(r.entryPolicy.policy, "subbarrels");
  assert.equal(r.entryPolicy.source, "detected");
  assert.ok(!rules(r).includes("deep-import"));
  assert.ok(r.findings.some((f) => f.rule === "entry-policy-assumed" && f.severity === "info"));
});

test("F-20: a mixed repo is ambiguous: root-only applies and the assumption is reported", () => {
  const files = { "src/features/cart/index.ts": "export {};", "src/features/cart/internal/x.ts": "export const x = 1;" };
  for (let i = 0; i < 3; i++) {
    files[`src/features/cart/part${i}/index.ts`] = `export const v${i} = ${i};`;
    files[`src/features/user${i}/index.ts`] = `import { v${i} } from '../cart/part${i}'; import { x } from '../cart/internal/x'; export const u = [v${i}, x];`;
  }
  const r = scan({ root: path.join(write(tmp(), files), "src") });
  assert.equal(r.entryPolicy.policy, "root-only");
  assert.ok(rules(r).includes("deep-import"));
  assert.ok(r.findings.some((f) => f.rule === "entry-policy-assumed"));
});

test("config aliases extend resolution for bundler-only aliases", () => {
  const dir = write(tmp(), {
    "fe-scan.config.json": { aliases: { "@app": "src" } },
    "src/features/cart/index.ts": "export {};", "src/features/cart/internal/p.ts": "export const p = 1;",
    "src/features/checkout/index.ts": "import { p } from '@app/features/cart/internal/p'; export const x = p;",
  });
  const r = scan({ root: path.join(dir, "src") });
  assert.ok(rules(r).includes("deep-import"));
  assert.equal(r.unresolvedImports, 0);
});

test("--json carries status, coverage, limitations, entryPolicy and the legacy fields", () => {
  const dir = write(tmp(), { "src/features/a/index.ts": "export {};" });
  const j = JSON.parse(cli([path.join(dir, "src"), "--json"]).stdout);
  for (const k of ["status", "coverage", "limitations", "entryPolicy", "suppressed", "tsconfig", "unresolvedImports", "counts", "findings"]) assert.ok(k in j, k);
});

test("Vue shadcn-shaped generated barrel: <script setup> importing '.' forms a cycle that `ignore` removes (Laravel + Vue shape)", () => {
  const dir = write(tmp(), {
    "package.json": { dependencies: { vue: "3" } },
    "jsconfig.json": { compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } } },
    "components/ui/button/Button.vue": '<script setup lang="ts">\nimport { buttonVariants } from ".";\nconst v = buttonVariants;\n</script>\n<template><button :class="v" /></template>\n',
    "components/ui/button/index.ts": 'export { default as Button } from "./Button.vue";\nexport const buttonVariants = "x";\n',
    "features/orders/index.ts": 'export { Button } from "@/components/ui/button";\n',
  });
  const r = scan({ root: dir });
  const cycle = r.findings.find((f) => f.rule === "import-cycle");
  assert.ok(cycle, JSON.stringify(r.findings));
  assert.match(cycle.message, /Button\.vue/);
  assert.equal(r.unresolvedImports, 0);
  const ignored = scan({ root: dir, ignore: ["components/ui/**"] });
  assert.ok(!ignored.findings.some((f) => f.rule === "import-cycle"));
});
