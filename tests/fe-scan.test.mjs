import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scan } from "../skills/fe-architecture/scripts/fe-scan.mjs";
import { canSymlink } from "./helpers.mjs";

function fixture(files, tsconfig) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fe-scan-"));
  for (const [name, body] of Object.entries(files)) {
    const f = path.join(dir, name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
  if (tsconfig) fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
  return dir;
}
const run = (dir, extra = {}) => scan({ root: path.join(dir, "src"), features: null, tsconfig: null, shared: "shared", maxLines: 400, ...extra });
const rules = (r) => r.findings.map((f) => f.rule);
const ALIAS = { compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } };

test("clean project: public-entry imports, no findings of error severity", () => {
  const dir = fixture({
    "src/features/cart/index.ts": "export { addItem } from './cart.api';",
    "src/features/cart/cart.api.ts": "export const addItem = () => 1;",
    "src/features/checkout/index.ts": "import { addItem } from '@/features/cart'; export const c = addItem;",
    "src/shared/ui/Button.ts": "export const Button = 1;",
  }, ALIAS);
  const r = run(dir);
  assert.equal(r.counts.error, 0, JSON.stringify(r.findings));
});

test("deep import via alias is an error", () => {
  const dir = fixture({
    "src/features/cart/index.ts": "export {};",
    "src/features/cart/internal/price.ts": "export const p = 1;",
    "src/features/checkout/index.ts": "import { p } from '@/features/cart/internal/price'; export const x = p;",
  }, ALIAS);
  assert.ok(rules(run(dir)).includes("deep-import"));
});

test("deep import via relative path is an error", () => {
  const dir = fixture({
    "src/features/cart/index.ts": "export {};",
    "src/features/cart/price.ts": "export const p = 1;",
    "src/features/checkout/index.ts": "import { p } from '../cart/price'; export const x = p;",
  });
  assert.ok(rules(run(dir)).includes("deep-import"));
});

test("same-capability internal imports are allowed", () => {
  const dir = fixture({
    "src/features/cart/index.ts": "export * from './a';",
    "src/features/cart/a.ts": "import { b } from './sub/b'; export const a = b;",
    "src/features/cart/sub/b.ts": "export const b = 1;",
  });
  assert.equal(run(dir).counts.error, 0);
});

test("shared importing a capability is an error", () => {
  const dir = fixture({
    "src/features/cart/index.ts": "export const cart = 1;",
    "src/shared/lib/x.ts": "import { cart } from '../../features/cart'; export const x = cart;",
  });
  assert.ok(rules(run(dir)).includes("shared-imports-capability"));
});

test("file import cycle is detected, including through a barrel", () => {
  const dir = fixture({
    "src/features/chat/index.ts": "export * from './model'; export * from './editor';",
    "src/features/chat/model.ts": "import { sel } from './editor'; export const m = sel;",
    "src/features/chat/editor.ts": "import { m } from './model'; export const sel = 1; export const e = m;",
  });
  assert.ok(rules(run(dir)).includes("import-cycle"));
});

test("capability cycle is a warning", () => {
  const dir = fixture({
    "src/features/a/index.ts": "import { b } from '../b'; export const a = b;",
    "src/features/b/index.ts": "import { a } from '../a'; export const b = a;",
  });
  assert.ok(rules(run(dir)).includes("capability-cycle"));
});

test("high fan-out is flagged at 3 capabilities", () => {
  const dir = fixture({
    "src/features/a/index.ts": "export const a=1;", "src/features/b/index.ts": "export const b=1;", "src/features/c/index.ts": "export const c=1;",
    "src/features/hub/index.ts": "import {a} from '../a'; import {b} from '../b'; import {c} from '../c'; export const h=[a,b,c];",
  });
  assert.ok(rules(run(dir)).includes("high-fan-out"));
});

test("single-consumer shared file is reported as info", () => {
  const dir = fixture({
    "src/shared/priceFormat.ts": "export const f = 1;",
    "src/features/cart/index.ts": "import { f } from '../../shared/priceFormat'; export const c = f;",
  });
  assert.ok(rules(run(dir)).includes("single-consumer-shared"));
});

test("large file and vague bucket are warnings", () => {
  const body = Array.from({ length: 200 }, (_, i) => `export const v${i} = ${i};`).join("\n");
  const dir = fixture({ "src/features/cart/index.ts": "export {};", "src/features/cart/utils.ts": body });
  const r = run(dir, { maxLines: 150 });
  assert.ok(rules(r).includes("large-file"));
  assert.ok(rules(r).includes("vague-bucket"));
});

test("no capability directory degrades to an info finding, not a crash", () => {
  const dir = fixture({ "src/app.ts": "export const x = 1;" });
  assert.ok(rules(run(dir)).includes("no-capability-dir"));
});

test("tsconfig with comments and trailing commas still parses", () => {
  const dir = fixture({
    "src/features/cart/index.ts": "export {};",
    "src/features/cart/internal/p.ts": "export const p = 1;",
    "src/features/checkout/index.ts": "import { p } from '@/features/cart/internal/p'; export const x = p;",
  });
  fs.writeFileSync(path.join(dir, "tsconfig.json"), `{\n // comment\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"], }, },\n}`);
  assert.ok(rules(run(dir)).includes("deep-import"));
});

test("regression: paths containing '/*' and later '*/' globs do not break tsconfig parsing", () => {
  const dir = fixture({
    "src/features/cart/index.ts": "export {};",
    "src/features/cart/internal/p.ts": "export const p = 1;",
    "src/features/checkout/index.ts": "import { p } from '@/features/cart/internal/p'; export const x = p;",
  });
  fs.writeFileSync(path.join(dir, "tsconfig.json"), `{"compilerOptions":{"paths":{"@/*":["./src/*"]}},"include":["**/*.ts","**/*.tsx"]}`);
  const r = run(dir);
  assert.ok(rules(r).includes("deep-import"), JSON.stringify(r.findings));
  assert.equal(r.unresolvedImports, 0);
});

test("tsconfig extends a relative base that declares the paths", () => {
  const dir = fixture({
    "src/features/cart/index.ts": "export {};",
    "src/features/cart/internal/p.ts": "export const p = 1;",
    "src/features/checkout/index.ts": "import { p } from '@/features/cart/internal/p'; export const x = p;",
    "tsconfig.base.json": `{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}`,
  });
  fs.writeFileSync(path.join(dir, "tsconfig.json"), `{"extends":"./tsconfig.base.json"}`);
  assert.ok(rules(run(dir)).includes("deep-import"));
});

test("--allow-subbarrels accepts a folder-level index as public", () => {
  const files = {
    "src/features/cart/index.ts": "export {};",
    "src/features/cart/types/index.ts": "export type T = 1;",
    "src/features/checkout/index.ts": "import type { T } from '../cart/types'; export type X = T;",
  };
  assert.ok(rules(run(fixture(files))).includes("deep-import"));
  assert.ok(!rules(run(fixture(files), { allowSubbarrels: true })).includes("deep-import"));
});

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const SCANNER = fileURLToPath(new URL("../skills/fe-architecture/scripts/fe-scan.mjs", import.meta.url));
const SEEDED = fileURLToPath(new URL("../evals/fixtures/react-seeded/src", import.meta.url));
const cli = (args) => spawnSync("node", [SCANNER, ...args], { encoding: "utf8" });

test("CLI: exits 1 with findings on the seeded fixture and 0 on a clean tree", () => {
  const bad = cli([SEEDED, "--fail-on", "error"]);
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /import-cycle/);
  const clean = fixture({ "src/features/a/index.ts": "export const a = 1;" });
  const ok = cli([path.join(clean, "src"), "--fail-on", "error"]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /summary:/);
});

test("CLI: prints output when the script path contains a space or is a symlink", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fe scan dir "));
  const copy = path.join(dir, "fe-scan.mjs");
  fs.copyFileSync(SCANNER, copy);
  const viaSpace = spawnSync("node", [copy, SEEDED, "--fail-on", "never"], { encoding: "utf8" });
  assert.match(viaSpace.stdout, /summary:/, "space in path must not silence the CLI");
  if (!canSymlink()) return; // symlink creation needs privileges on some Windows runners; the space case above still ran
  const link = path.join(dir, "linked.mjs");
  fs.symlinkSync(SCANNER, link);
  const viaLink = spawnSync("node", [link, SEEDED, "--fail-on", "never"], { encoding: "utf8" });
  assert.match(viaLink.stdout, /summary:/, "symlinked install must not silence the CLI");
});

test("CLI: usage error exits 2, missing root exits 2", () => {
  assert.equal(cli([]).status, 2);
  assert.equal(cli(["/nonexistent/path/xyz"]).status, 2);
});
