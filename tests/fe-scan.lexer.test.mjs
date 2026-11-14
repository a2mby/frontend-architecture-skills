import test from "node:test";
import assert from "node:assert/strict";
import { extractImports, scriptSource } from "../skills/fe-architecture/scripts/fe-scan.mjs";

const specs = (src, file = "a.ts") => extractImports(scriptSource(src, file)).imports.map((i) => i.spec);

test("F-07: imports inside comments, strings and template literals are ignored", () => {
  const src = [
    '// import { p } from "@/features/cart/internal/p";',
    '/* export * from "@/features/cart/internal/p"; */',
    'const doc = `import x from "@/features/cart/internal/p"`;',
    "const s = 'import y from \"z\"';",
    'const t = `a ${ "import q from \'w\'" } b`;',
  ].join("\n");
  assert.deepEqual(specs(src), []);
});

test("F-07: every real import form is still detected, with line numbers", () => {
  const src = [
    'import a from "a";',
    'import type { T } from "b";',
    'import * as ns from "c";',
    'import d, { e as f } from "d";',
    'import "side-effect";',
    'export * from "e";',
    'export * as g from "f";',
    'export { h } from "g";',
    'export type { I } from "h";',
    'const x = await import("i");',
    'const y = require("j");',
    "import {\n  multi,\n  line,\n} from 'k';",
    'import json from "./data.json" with { type: "json" };',
    'import type from "l";',
  ].join("\n");
  const r = extractImports(src).imports;
  assert.deepEqual(r.map((i) => i.spec), ["a", "b", "c", "d", "side-effect", "e", "f", "g", "h", "i", "j", "k", "./data.json", "l"]);
  assert.equal(r[0].line, 1);
  assert.equal(r.find((i) => i.spec === "k").line, 15, "multi-line import reports the line of its specifier");
});

test("F-07: braces named like keywords and property access do not confuse the reader", () => {
  const src = 'const o = { import: 1, from: "x" }; o.import("not-an-import"); import { from } from "real";';
  assert.deepEqual(specs(src), ["real"]);
});

test("F-07: regex literals, division and JSX text apostrophes do not swallow real imports", () => {
  const src = [
    "const re = /import x from 'nope'/g; const half = total / 2 / 3;",
    "const el = <p>don't import 'fake' here</p>;",
    'import real from "real";',
  ].join("\n");
  assert.deepEqual(specs(src, "a.tsx"), ["real"]);
});

test("F-07: template literal with nested template and braces keeps line numbers right", () => {
  const src = 'const t = `a ${ `b ${1}` } {\n}`;\nimport z from "z";';
  const r = extractImports(src).imports;
  assert.equal(r[0].spec, "z");
  assert.equal(r[0].line, 3);
});

test("F-07: .vue and .svelte read only <script> blocks and keep line numbers", () => {
  const vue = '<template><p>import x from "tpl"</p></template>\n<script setup lang="ts">\nimport a from "real-a";\n</script>\n<style>@import "nope";</style>';
  const r = extractImports(scriptSource(vue, "A.vue")).imports;
  assert.deepEqual(r.map((i) => i.spec), ["real-a"]);
  assert.equal(r[0].line, 3);
  const svelte = '<script context="module">import m from "mod";</script>\n<script>import i from "inst";</script>\n<div>import n from "nope"</div>';
  assert.deepEqual(specs(svelte, "B.svelte"), ["mod", "inst"]);
});

test("F-16: dynamic imports with non-literal arguments and glob imports are reported as not followed", () => {
  const r = extractImports('import(name); import(`./x/${y}`); import.meta.glob("./*.ts"); require.context("./a"); import("lit");');
  assert.equal(r.dynamic.length, 2);
  assert.equal(r.globs.length, 2);
  assert.deepEqual(r.imports.map((i) => i.spec), ["lit"]);
});
