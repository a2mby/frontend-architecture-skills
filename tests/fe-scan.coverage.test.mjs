import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scan } from "../skills/fe-architecture/scripts/fe-scan.mjs";
import { copyFixture, tmp, write, cli, ALIAS, canSymlink } from "./helpers.mjs";

const rules = (r) => r.findings.map((f) => f.rule);
const run = (root, extra = {}) => scan({ root, ...extra });

test("F-01: Vite default layout (paths only in tsconfig.app.json via references) detects the deep import", () => {
  const dir = copyFixture("vite-react");
  const r = run(path.join(dir, "src"));
  assert.ok(rules(r).includes("deep-import"), JSON.stringify(r.findings));
  assert.equal(r.coverage.status, "complete");
  assert.equal(r.status, "fail");
});

test("F-01: Laravel jsconfig.json is discovered (deep import and cycle visible without --tsconfig)", () => {
  const f = run(path.join(copyFixture("laravel-features"), "resources/js"));
  assert.ok(rules(f).includes("deep-import"));
  const i = run(path.join(copyFixture("laravel-inertia"), "resources/js"));
  assert.ok(rules(i).includes("import-cycle"));
});

test("F-01: unresolved project imports make the result partial, never an unqualified pass", () => {
  const dir = write(tmp(), {
    "src/features/cart/index.ts": "import { x } from '@/missing/thing'; export const c = x;",
    "src/features/search/index.ts": "export const s = 1;",
  });
  const r = run(path.join(dir, "src"));
  assert.equal(r.counts.error, 0);
  assert.equal(r.status, "partial");
  assert.equal(r.coverage.status, "partial");
  assert.equal(r.unresolvedImports, 1);
  assert.equal(r.coverage.percent, 0);
  const text = cli([path.join(dir, "src"), "--fail-on", "error"]);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /COVERAGE GAP/);
  assert.match(text.stdout, /INCOMPLETE/);
  assert.doesNotMatch(text.stdout, /result: PASS/);
});

test("F-01: --min-coverage and --strict-coverage exit 3 on a partial scan", () => {
  const dir = write(tmp(), { "src/features/a/index.ts": "import '@/nope/x';" });
  assert.equal(cli([path.join(dir, "src"), "--min-coverage", "90"]).status, 3);
  assert.equal(cli([path.join(dir, "src"), "--strict-coverage"]).status, 3);
  assert.equal(cli([path.join(dir, "src"), "--min-coverage", "0"]).status, 0);
});

test("F-01: SvelteKit before sync reports the missing extends and falls back to the default $lib", () => {
  const dir = copyFixture("sveltekit");
  fs.rmSync(path.join(dir, ".svelte-kit"), { recursive: true });
  write(dir, { "svelte.config.js": "export default {};" });
  const r = run(path.join(dir, "src/lib"), { features: "features" });
  assert.ok(r.limitations.some((l) => l.id === "config-extends-missing"), JSON.stringify(r.limitations));
  assert.ok(r.limitations.some((l) => l.id === "sveltekit-lib-default"));
  assert.equal(r.coverage.status, "partial", "a missing generated config is a coverage limitation, not silence");
  assert.ok(rules(r).includes("deep-import"));
});

test("F-01: SvelteKit after sync resolves $lib from the generated tsconfig", () => {
  const dir = copyFixture("sveltekit");
  const r = run(path.join(dir, "src/lib"), { features: "features" });
  assert.ok(rules(r).includes("deep-import"));
  assert.equal(r.coverage.status, "complete");
});

test("F-01: externals are bucketed, not counted as unresolved (deps, builtins, virtual, assets, ?raw, .js to .ts)", () => {
  const dir = write(tmp(), {
    "package.json": { dependencies: { react: "1", "@scope/pkg": "1" } },
    "src/app.ts": [
      'import React from "react"; import p from "@scope/pkg/deep"; import fs from "node:fs"; import path from "path";',
      'import v from "virtual:thing"; import { page } from "$app/stores"; import "./style.css"; import raw from "./a.txt?raw";',
      'import { b } from "./b.js"; import q from "unknown-lib";',
    ].join("\n"),
    "src/a.txt": "x", "src/style.css": "x", "src/b.ts": "export const b = 1;",
  });
  const r = run(path.join(dir, "src"));
  assert.equal(r.unresolvedImports, 0, JSON.stringify(r.coverage));
  const b = r.coverage.buckets;
  assert.deepEqual([b.dependency, b.builtin, b.virtual, b.asset, b.resolved, b["unknown-bare"]], [2, 2, 2, 2, 1, 1]);
  assert.equal(r.coverage.unknownBare[0].name, "unknown-lib");
  assert.equal(r.status, "pass");
});

test("F-01: baseUrl-only bare specifiers resolve (jsconfig style)", () => {
  const dir = write(tmp(), {
    "jsconfig.json": { compilerOptions: { baseUrl: "src" } },
    "src/features/cart/index.js": "export {};",
    "src/features/cart/internal/p.js": "export const p = 1;",
    "src/features/checkout/index.js": "import { p } from 'features/cart/internal/p'; export const x = p;",
  });
  assert.ok(rules(run(path.join(dir, "src"))).includes("deep-import"));
});

test("F-01: Next.js project, nested aliases and several configs are unioned", () => {
  const dir = write(tmp(), {
    "package.json": { dependencies: { next: "1" } },
    "tsconfig.json": { compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"], "@ui/*": ["src/shared/ui/*"], "@deep/a/b/*": ["src/features/cart/*"] } } },
    "src/features/cart/index.ts": "export {};",
    "src/features/cart/internal/p.ts": "export const p = 1;",
    "src/features/checkout/index.ts": "import { p } from '@deep/a/b/internal/p'; import { B } from '@ui/Button'; export const x = [p, B];",
    "src/shared/ui/Button.ts": "export const B = 1;",
  });
  const r = run(path.join(dir, "src"));
  assert.ok(rules(r).includes("deep-import"));
  assert.equal(r.unresolvedImports, 0);
});

test("F-16: Nuxt, Angular and import.meta.glob limitations are printed in the report", () => {
  const nuxt = write(tmp(), { "nuxt.config.ts": "export default {}", "src/features/a/index.ts": "export const a = import.meta.glob('./*.ts');" });
  const r = run(path.join(nuxt, "src"));
  const ids = r.limitations.map((l) => l.id);
  assert.ok(ids.includes("nuxt-auto-imports") && ids.includes("glob-imports"), ids.join());
  const ng = write(tmp(), { "angular.json": "{}", "src/app/features/a/public-api.ts": "export {};" });
  assert.ok(run(path.join(ng, "src/app")).limitations.some((l) => l.id === "angular-templates"));
  assert.match(cli([path.join(nuxt, "src")]).stdout, /NOT CHECKED[\s\S]*Nuxt auto-imports/);
});

test("F-08: relative imports escaping the source root warn, and a workspace is reported as unchecked", () => {
  const dir = write(tmp(), {
    "package.json": { workspaces: ["apps/*"] },
    "apps/admin/src/features/z/internal/z.ts": "export const z = 1;",
    "apps/web/src/features/a/index.ts": "import { z } from '../../../../admin/src/features/z/internal/z'; export const a = z;",
  });
  const r = run(path.join(dir, "apps/web/src"));
  assert.ok(rules(r).includes("escapes-root"));
  assert.ok(r.limitations.some((l) => l.id === "monorepo-packages"));
  assert.equal(r.unresolvedImports, 0);
});

test("scanner handles a project path containing spaces, via a symlinked checkout", { skip: !canSymlink() && "symlinks not permitted on this runner" }, () => {
  const dir = write(tmp("fe space dir "), {
    "package.json": {}, "tsconfig.json": ALIAS,
    "src/features/cart/index.ts": "export {};", "src/features/cart/internal/p.ts": "export const p=1;",
    "src/features/checkout/index.ts": "import { p } from '@/features/cart/internal/p'; export const x = p;",
  });
  assert.ok(rules(run(path.join(dir, "src"))).includes("deep-import"));
  const link = path.join(tmp(), "linked");
  fs.symlinkSync(dir, link);
  const out = cli([path.join(link, "src"), "--fail-on", "error"]);
  assert.equal(out.status, 1, out.stdout + out.stderr);
  assert.match(out.stdout, /deep-import/);
});

test("cycles through a barrel and deep imports still fail with correct fields (rule, severity, file, line, target, fix)", () => {
  const dir = write(tmp(), {
    "tsconfig.json": ALIAS,
    "src/features/cart/index.ts": "export {};", "src/features/cart/internal/p.ts": "export const p=1;",
    "src/features/checkout/index.ts": "\nimport { p } from '@/features/cart/internal/p'; export const x = p;",
  });
  const f = run(path.join(dir, "src")).findings.find((x) => x.rule === "deep-import");
  assert.equal(f.severity, "error");
  assert.equal(f.file, "features/checkout/index.ts");
  assert.equal(f.line, 2);
  assert.equal(f.target, "features/cart/internal/p.ts");
  assert.ok(f.fix);
});
