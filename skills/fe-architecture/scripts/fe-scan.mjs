#!/usr/bin/env node
// fe-scan: dependency-free structure scanner for frontend capability boundaries.
// Usage: node fe-scan.mjs <sourceRoot> [options]   (run with --help for the option list)
// Imports are read with a small JS/TS lexer (comments, strings, template literals and regex literals are
// skipped; .vue/.svelte read only <script> blocks). It is not a type checker: confirm findings before acting.
// Exit codes: 0 ok, 1 violations at or above --fail-on, 2 usage or internal error, 3 coverage below --min-coverage.
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

export const SCANNER_VERSION = "0.2.0";
const EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".nuxt", ".svelte-kit", "dist", "build", "coverage", ".turbo", ".git", ".output", "vendor"]);
const ENTRY_RE = /^(index|public-api)(\.[a-z]+)?\.(ts|tsx|js|jsx|mjs|mts|vue|svelte)$/;
const VAGUE_RE = /^(utils?|helpers?|common|misc|lib)\.(ts|tsx|js|jsx)$/;
const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, "")));
const VIRTUAL_PREFIXES = ["virtual:", "$app/", "$env/", "$service-worker", "#imports", "#app", "#build", "#components", "#vue-router", "~icons/", "astro:", "nuxt/", "next/"];
const SEVERITIES = ["error", "warn", "info"];

const FIXES = {
  "deep-import": "Import through the capability's public entry, or export what you need from that entry.",
  "shared-imports-capability": "Keep shared code domain-free: move the piece into the capability, or pass the value in as a prop or argument.",
  "import-cycle": "Extract the shared concept into a third module both sides import, or invert one edge.",
  "capability-cycle": "Extract the shared concept or lift the coordination into the composition layer.",
  "high-fan-out": "Move coordination into the composition layer, or check the capability is not doing two jobs.",
  "single-consumer-shared": "Per the ownership ladder, move it inside the one capability that uses it.",
  "large-file": "Look for a second reason to change and split along it; size alone is not a defect.",
  "vague-bucket": "Find the owner of each rule in the file and move it there.",
  "no-public-entry": "Add one public entry (index) exporting the capability's contract.",
  "unguarded-capability": "Optional: give the capability one public entry and set entryPolicy so composition-layer imports are enforced too.",
  "escapes-root": "Imports that leave the source root are not checked; use a package entry, or scan the other root too.",
  "exception-expired": "Fix the violation, or renew the exception with a new date and a reason.",
  "stale-baseline": "Run with --write-baseline to drop entries for violations that no longer exist.",
};

// ---------------------------------------------------------------------------------------------- args
export function parseArgs(argv) {
  const opts = {
    root: null, features: null, tsconfig: null, shared: "shared", maxLines: 400, json: false, failOn: "error", limit: 8, all: false,
    allowSubbarrels: false, entryPolicy: null, config: null, noConfig: false, baseline: null, writeBaseline: null, ignore: [], minCoverage: null, help: false,
  };
  const rest = [];
  const need = (i, flag) => { if (i >= argv.length) throw new Error(`${flag} needs a value`); return argv[i]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--features") opts.features = need(++i, a);
    else if (a === "--tsconfig") opts.tsconfig = need(++i, a);
    else if (a === "--shared") opts.shared = need(++i, a);
    else if (a === "--max-lines") opts.maxLines = Number(need(++i, a));
    else if (a === "--fail-on") opts.failOn = need(++i, a);
    else if (a === "--limit") opts.limit = Number(need(++i, a));
    else if (a === "--all") opts.all = true;
    else if (a === "--allow-subbarrels") opts.allowSubbarrels = true;
    else if (a === "--entry-policy") opts.entryPolicy = need(++i, a);
    else if (a === "--config") opts.config = need(++i, a);
    else if (a === "--no-config") opts.noConfig = true;
    else if (a === "--baseline") opts.baseline = need(++i, a);
    else if (a === "--write-baseline") opts.writeBaseline = need(++i, a);
    else if (a === "--ignore") opts.ignore.push(need(++i, a));
    else if (a === "--min-coverage") opts.minCoverage = Number(need(++i, a));
    else if (a === "--strict-coverage") opts.minCoverage = 100;
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else rest.push(a);
  }
  opts.root = rest[0] ?? null;
  return opts;
}

const USAGE = `usage: node fe-scan.mjs <sourceRoot> [options]
  --features <dir>        capabilities directory under the root (default: features|modules|domains|capabilities)
  --shared <dir>          shared directory under the root (default: shared)
  --entry-policy <p>      root-only | subbarrels | declared (default: detected, root-only when unsure); --allow-subbarrels = subbarrels
  --tsconfig <file>       use this tsconfig/jsconfig instead of discovery
  --config <file>         fe-scan.config.json (default: discovered at the root or a parent; --no-config to skip)
  --ignore <glob>         skip files as sources of findings (repeatable); they still resolve as targets
  --baseline <file>       suppress findings recorded in the baseline; fail only on new ones
  --write-baseline <file> record current error/warn findings as the baseline, then exit 0
  --min-coverage <pct>    exit 3 when fewer than pct% of project-internal imports resolve; --strict-coverage = 100
  --fail-on error|warn|never   exit 1 at this severity (default error)
  --max-lines N  --limit N  --all  --json  --help`;

// ---------------------------------------------------------------------------------------------- jsonc
export function stripJsonc(raw) {
  let out = "", i = 0, inStr = false;
  while (i < raw.length) {
    const c = raw[i], n = raw[i + 1];
    if (inStr) {
      out += c;
      if (c === "\\") { out += n ?? ""; i += 2; continue; }
      if (c === '"') inStr = false;
      i++;
    } else if (c === '"') { inStr = true; out += c; i++; }
    else if (c === "/" && n === "/") { while (i < raw.length && raw[i] !== "\n") i++; }
    else if (c === "/" && n === "*") { i += 2; while (i < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++; i += 2; }
    else { out += c; i++; }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}
const readJsonc = (file) => JSON.parse(stripJsonc(fs.readFileSync(file, "utf8")));
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// ---------------------------------------------------------------------------------------------- lexer
const REGEX_AFTER_WORD = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);
const isWordStart = (c) => /[A-Za-z_$]/.test(c) || c > "\x7f";
const isWordChar = (c) => /[A-Za-z0-9_$]/.test(c) || c > "\x7f";

/** Tokenize JS/TS source into words, strings, punctuation. Comments are dropped; template literals are opaque. */
export function tokenize(src) {
  const toks = [];
  const n = src.length;
  let i = 0, line = 1, prev = null;
  const push = (type, value, ln) => { prev = { type, value, line: ln }; toks.push(prev); };
  const regexAllowed = () => {
    if (!prev) return true;
    if (prev.type === "num" || prev.type === "str" || prev.type === "tpl" || prev.type === "regex") return false;
    if (prev.type === "word") return REGEX_AFTER_WORD.has(prev.value);
    return ![")", "]", "}", "<"].includes(prev.value);
  };
  // Skips a template literal starting at the backtick; returns the index after it. Handles ${ } nesting.
  const skipTemplate = (start) => {
    let j = start + 1;
    while (j < n) {
      const c = src[j];
      if (c === "\\") { j += 2; continue; }
      if (c === "\n") line++;
      if (c === "`") return j + 1;
      if (c === "$" && src[j + 1] === "{") { j = skipExpr(j + 2); continue; }
      j++;
    }
    return j;
  };
  // Skips code inside ${ ... } up to and including the matching brace.
  const skipExpr = (start) => {
    let j = start, depth = 1;
    while (j < n && depth > 0) {
      const c = src[j];
      if (c === "\n") { line++; j++; }
      else if (c === "{") { depth++; j++; }
      else if (c === "}") { depth--; j++; }
      else if (c === "`") j = skipTemplate(j);
      else if (c === '"' || c === "'") { j++; while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1; j++; }
      else if (c === "/" && src[j + 1] === "/") { while (j < n && src[j] !== "\n") j++; }
      else if (c === "/" && src[j + 1] === "*") { j += 2; while (j < n && !(src[j] === "*" && src[j + 1] === "/")) { if (src[j] === "\n") line++; j++; } j += 2; }
      else j++;
    }
    return j;
  };
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
    if (c === '"' || c === "'") {
      const startLine = line;
      let j = i + 1, val = "";
      while (j < n && src[j] !== c && src[j] !== "\n") { if (src[j] === "\\") { val += src[j + 1] ?? ""; j += 2; } else { val += src[j]; j++; } }
      if (src[j] === c) j++; // an unterminated string ends at the newline (JSX text apostrophes)
      i = j; push("str", val, startLine); continue;
    }
    if (c === "`") { const startLine = line; i = skipTemplate(i); push("tpl", "", startLine); continue; }
    if (c === "/" && regexAllowed()) {
      let j = i + 1, inClass = false, ok = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) { ok = true; break; }
        j++;
      }
      if (ok) { j++; while (j < n && isWordChar(src[j])) j++; push("regex", "", line); i = j; continue; }
    }
    if (isWordStart(c)) { let j = i + 1; while (j < n && isWordChar(src[j])) j++; push("word", src.slice(i, j), line); i = j; continue; }
    if (c >= "0" && c <= "9") { let j = i + 1; while (j < n && /[0-9A-Za-z_.]/.test(src[j])) j++; push("num", "", line); i = j; continue; }
    push("punct", c, line); i++;
  }
  return toks;
}

/** Extract import specifiers and dynamic-import limitations from JS/TS source. Exported for tests. */
export function extractImports(source) {
  const toks = tokenize(source);
  const imports = [], dynamic = [], globs = [];
  const is = (t, type, value) => t && t.type === type && (value === undefined || t.value === value);
  const skipBraces = (j) => { // toks[j] is "{"; returns index after the matching "}"
    let depth = 0;
    for (; j < toks.length; j++) {
      if (is(toks[j], "punct", "{")) depth++;
      else if (is(toks[j], "punct", "}") && --depth === 0) return j + 1;
    }
    return j;
  };
  const fromClause = (j) => (is(toks[j], "word", "from") && is(toks[j + 1], "str") ? toks[j + 1] : null);
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.type !== "word" || is(toks[k - 1], "punct", ".")) continue;
    const next = toks[k + 1];
    if (t.value === "import") {
      if (is(next, "str")) imports.push({ spec: next.value, line: next.line, kind: "static" });
      else if (is(next, "punct", "(")) {
        const arg = toks[k + 2];
        if (is(arg, "str") && (is(toks[k + 3], "punct", ")") || is(toks[k + 3], "punct", ","))) imports.push({ spec: arg.value, line: arg.line, kind: "dynamic" });
        else dynamic.push({ line: t.line, kind: "non-literal-import" });
      } else if (is(next, "punct", ".") && is(toks[k + 2], "word", "meta") && is(toks[k + 4], "word") && /^glob/.test(toks[k + 4].value)) globs.push({ line: t.line, kind: "import.meta.glob" });
      else {
        let j = k + 1;
        if (is(toks[j], "word") && (toks[j].value === "type" || toks[j].value === "typeof") && !(is(toks[j + 1], "word", "from") && is(toks[j + 2], "str"))) j++;
        if (is(toks[j], "word") && toks[j].value !== "from") { j++; if (is(toks[j], "punct", ",")) j++; }
        else if (is(toks[j], "word", "from") && is(toks[j + 1], "word", "from")) j++;
        if (is(toks[j], "punct", "*")) { j++; if (is(toks[j], "word", "as")) j += 2; }
        else if (is(toks[j], "punct", "{")) j = skipBraces(j);
        const from = fromClause(j);
        if (from) imports.push({ spec: from.value, line: from.line, kind: "static" });
      }
    } else if (t.value === "export") {
      let j = k + 1;
      if (is(toks[j], "word", "type")) j++;
      if (is(toks[j], "punct", "*")) { j++; if (is(toks[j], "word", "as")) j += 2; }
      else if (is(toks[j], "punct", "{")) j = skipBraces(j);
      else continue;
      const from = fromClause(j);
      if (from) imports.push({ spec: from.value, line: from.line, kind: "static" });
    } else if (t.value === "require" && is(next, "punct", "(")) {
      const arg = toks[k + 2];
      if (is(arg, "str") && is(toks[k + 3], "punct", ")")) imports.push({ spec: arg.value, line: arg.line, kind: "require" });
    } else if (t.value === "require" && is(next, "punct", ".") && is(toks[k + 2], "word", "context")) globs.push({ line: t.line, kind: "require.context" });
  }
  return { imports, dynamic, globs };
}

/** For .vue and .svelte keep only <script> blocks, preserving line numbers. */
export function scriptSource(source, file) {
  if (!/\.(vue|svelte)$/.test(file)) return source;
  const parts = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(source))) {
    const startOfBody = m.index + m[0].indexOf(">") + 1;
    const before = source.slice(0, startOfBody).split("\n").length - 1;
    parts.push("\n".repeat(before) + m[1]);
  }
  // Each block is padded to its own line offset; blocks are tokenized independently by joining with a separator.
  return parts.join("\n;\n");
}

// ---------------------------------------------------------------------------------------------- globs
export function globToRegExp(glob) {
  let g = glob.replace(/\\/g, "/");
  if (g.endsWith("/")) g += "**";
  if (!g.includes("/")) g = "**/" + g;
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") {
      if (g[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i += 1; }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

// ---------------------------------------------------------------------------------------------- project config
function resolveExtends(from, spec) {
  const base = spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  const candidates = [];
  if (base) candidates.push(base, base + ".json", path.join(base, "tsconfig.json"));
  else {
    let dir = path.dirname(from);
    for (let i = 0; i < 8; i++) {
      candidates.push(path.join(dir, "node_modules", spec), path.join(dir, "node_modules", spec + ".json"), path.join(dir, "node_modules", spec, "tsconfig.json"));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return candidates.find(isFile) ?? null;
}

// Returns { paths: {pattern: targets[]}, pathsBase, baseUrl, references: [files], missing: [specs] } for one config file.
function loadCompilerOptions(file, missing, depth = 0) {
  const json = readJsonc(file);
  let merged = {};
  const parents = depth < 6 && json.extends ? [].concat(json.extends) : [];
  for (const spec of parents) {
    const parent = resolveExtends(file, spec);
    if (parent) { try { merged = { ...merged, ...loadCompilerOptions(parent, missing, depth + 1) }; } catch { missing.push({ file, spec, reason: "unreadable" }); } }
    else missing.push({ file, spec, reason: "not found" });
  }
  const own = json.compilerOptions ?? {};
  const declaredDir = path.dirname(file);
  const baseUrl = own.baseUrl !== undefined ? path.resolve(declaredDir, own.baseUrl) : merged.baseUrl;
  const pathsBase = own.paths !== undefined ? (baseUrl ?? declaredDir) : merged.pathsBase;
  return { baseUrl, pathsBase, paths: own.paths ?? merged.paths };
}

const CONFIG_NAME_RE = /^(tsconfig|jsconfig)(\..+)?\.json$/;

function findPackageRoot(root) {
  let dir = path.resolve(root);
  for (let i = 0; i < 8; i++) {
    if (isFile(path.join(dir, "package.json"))) return dir;
    if (isDir(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Collect every tsconfig/jsconfig from the source root up to the package root, following `references`. */
export function discoverConfigs(root, explicit) {
  const limitations = [];
  const aliases = []; // { pattern, prefix, wildcard, targets: [abs prefix] }
  const baseUrls = [];
  const used = [];
  const seen = new Set();
  const missing = [];
  const queue = [];
  if (explicit) queue.push(path.resolve(explicit));
  else {
    const pkgRoot = findPackageRoot(root);
    let dir = path.resolve(root);
    for (let i = 0; i < 8; i++) {
      let names = [];
      try { names = fs.readdirSync(dir).filter((f) => CONFIG_NAME_RE.test(f)).sort((a, b) => (a === "tsconfig.json" ? -1 : b === "tsconfig.json" ? 1 : a.localeCompare(b))); } catch { /* unreadable dir */ }
      for (const f of names) queue.push(path.join(dir, f));
      if (dir === pkgRoot) break;
      const parent = path.dirname(dir);
      if (parent === dir || isDir(path.join(dir, ".git"))) break;
      dir = parent;
    }
  }
  const visit = (file, depth) => {
    const real = (() => { try { return fs.realpathSync(file); } catch { return file; } })();
    if (seen.has(real) || !isFile(file)) return;
    seen.add(real);
    let co;
    try { co = loadCompilerOptions(file, missing); } catch (e) { limitations.push({ id: "config-unreadable", message: `${path.basename(file)} could not be parsed (${e.message}); its aliases are not applied` }); return; }
    used.push(file);
    if (co.baseUrl) baseUrls.push(co.baseUrl);
    for (const [pattern, targets] of Object.entries(co.paths ?? {})) {
      aliases.push({ pattern, prefix: pattern.replace(/\*$/, ""), wildcard: pattern.endsWith("*"), targets: targets.map((t) => path.resolve(co.pathsBase ?? path.dirname(file), t.replace(/\*$/, ""))) });
    }
    let json = {};
    try { json = readJsonc(file); } catch { /* handled above */ }
    if (depth < 4) for (const ref of json.references ?? []) {
      if (!ref?.path) continue;
      const p = path.resolve(path.dirname(file), ref.path);
      visit(isDir(p) ? path.join(p, "tsconfig.json") : p, depth + 1);
    }
  };
  for (const f of queue) visit(f, 0);
  for (const m of missing) limitations.push({ id: "config-extends-missing", message: `${path.basename(m.file)} extends "${m.spec}" which is ${m.reason}; aliases it would define are unknown (generated config? run the framework's sync/prepare step)` });
  return { aliases, baseUrls, used, limitations };
}

function readDependencies(root) {
  const deps = new Set();
  let dir = path.resolve(root);
  for (let i = 0; i < 8; i++) {
    const pj = path.join(dir, "package.json");
    if (isFile(pj)) {
      try {
        const j = JSON.parse(fs.readFileSync(pj, "utf8"));
        for (const k of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) for (const d of Object.keys(j[k] ?? {})) deps.add(d);
        if (j.name) deps.add(j.name);
      } catch { /* ignore broken package.json */ }
    }
    if (isDir(path.join(dir, ".git"))) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return deps;
}

function findUp(root, names, levels = 8) {
  let dir = path.resolve(root);
  for (let i = 0; i < levels; i++) {
    for (const n of names) { const p = path.join(dir, n); if (fs.existsSync(p)) return p; }
    if (isDir(path.join(dir, ".git"))) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
const findConfigFile = (root, bases) => findUp(root, bases.flatMap((b) => ["", ".js", ".ts", ".mjs", ".cjs", ".mts"].map((e) => b + e)));

function readFeConfig(root, opts) {
  if (opts.noConfig) return { file: null, config: {} };
  const file = opts.config ? path.resolve(opts.config) : findUp(root, ["fe-scan.config.json"]);
  if (!file) return { file: null, config: {} };
  try { return { file, config: readJsonc(file) }; } catch (e) { throw new Error(`cannot read config ${file}: ${e.message}`); }
}

// ---------------------------------------------------------------------------------------------- resolution
const CODE_SWAP = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };

function tryFile(base, fileSet) {
  const candidates = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => path.join(base, "index" + e))];
  const ext = path.extname(base);
  if (CODE_SWAP[ext]) candidates.push(...CODE_SWAP[ext].map((e) => base.slice(0, -ext.length) + e));
  return candidates.find((c) => fileSet.has(c)) ?? null;
}
const diskHit = (base) => [base, ...EXT.map((e) => base + e), ...EXT.map((e) => path.join(base, "index" + e))].some((c) => isFile(c)) || (isDir(base) && fs.readdirSync(base).some((f) => /^index\./.test(f)));

function packageName(spec) {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function makeClassifier({ fileSet, aliases, baseUrls, deps, extraAliases, root }) {
  const all = [...aliases, ...extraAliases];
  const sortedAliases = [...all].sort((a, b) => b.prefix.length - a.prefix.length);
  return (spec, fromFile) => {
    const clean = spec.replace(/[?#].*$/, "");
    if (clean === "") return { bucket: "asset" };
    if (clean.startsWith(".")) {
      const abs = path.resolve(path.dirname(fromFile), clean);
      const hit = tryFile(abs, fileSet);
      if (hit) return { bucket: "resolved", target: hit };
      const outside = path.relative(root, abs).startsWith("..");
      if (outside) return diskHit(abs) || fs.existsSync(abs) ? { bucket: "outside-root", target: abs } : { bucket: "unresolved", reason: "relative path outside the source root does not exist" };
      if (fs.existsSync(abs)) return { bucket: "asset" }; // css, svg, json, .d.ts, directory without a code index
      return { bucket: "unresolved", reason: "relative path not found" };
    }
    let aliasMatched = false;
    for (const a of sortedAliases) {
      if (a.wildcard ? clean.startsWith(a.prefix) : clean === a.prefix) {
        aliasMatched = true;
        const tail = a.wildcard ? clean.slice(a.prefix.length) : "";
        for (const t of a.targets) {
          const abs = path.join(t, tail);
          const hit = tryFile(abs, fileSet);
          if (hit) return { bucket: "resolved", target: hit };
          if (tail && fs.existsSync(abs)) return { bucket: "asset" };
        }
      }
    }
    if (clean.startsWith("node:") || BUILTINS.has(clean) || BUILTINS.has(clean.split("/")[0])) return { bucket: "builtin" };
    if (aliasMatched) return { bucket: "unresolved", reason: "alias matched but the target file does not exist (generated or moved?)", alias: true };
    if (VIRTUAL_PREFIXES.some((p) => clean.startsWith(p))) return { bucket: "virtual" };
    const pkg = packageName(clean);
    if (deps.has(pkg)) return { bucket: "dependency" };
    for (const b of baseUrls) {
      const hit = tryFile(path.resolve(b, clean), fileSet);
      if (hit) return { bucket: "resolved", target: hit };
    }
    if (clean.startsWith("/")) return { bucket: "unknown-bare" };
    if (/^(@\/|~\/|~~\/|@@\/|\$[A-Za-z]|#[A-Za-z])/.test(clean)) return { bucket: "unresolved", reason: "alias-shaped specifier with no matching alias in any tsconfig/jsconfig", alias: true };
    return { bucket: "unknown-bare" };
  };
}

// ---------------------------------------------------------------------------------------------- graph helpers
function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (EXT.includes(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) out.push(path.join(dir, entry.name));
  }
  return out;
}

function detectFeaturesDir(root, explicit) {
  if (explicit) return path.resolve(root, explicit);
  for (const name of ["features", "modules", "domains", "capabilities"]) {
    const dir = path.join(root, name);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  }
  return null;
}

function stronglyConnected(nodes, edges) {
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  const visit = (v) => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1) out.push(comp);
    }
  };
  for (const n of nodes) if (!idx.has(n)) visit(n);
  return out;
}

// ---------------------------------------------------------------------------------------------- baseline
export const fingerprint = (f) => [f.rule, f.file ?? "", f.target ?? ""].join("|");

function loadBaseline(file) {
  const j = readJsonc(file);
  const entries = Array.isArray(j) ? j : j.entries;
  if (!Array.isArray(entries)) throw new Error(`baseline ${file} has no "entries" array`);
  const out = [];
  for (const e of entries) {
    if (!e.rule || !e.file) throw new Error(`baseline ${file}: every entry needs rule and file`);
    if (!e.reason || !String(e.reason).trim()) throw new Error(`baseline ${file}: entry ${e.rule} ${e.file} has no reason; an exception without a reason is rejected`);
    out.push({ rule: e.rule, file: e.file, target: e.target ?? "", count: e.count ?? 1, reason: e.reason, expires: e.expires ?? null });
  }
  return out;
}

function applyExceptions(findings, entries, today, add) {
  const budget = new Map();
  const expiredKeys = new Set();
  for (const e of entries) {
    const key = fingerprint(e);
    if (e.expires && e.expires < today) { expiredKeys.add(key); add("error", "exception-expired", `exception for ${e.rule} in ${e.file}${e.target ? " -> " + e.target : ""} expired on ${e.expires} (${e.reason})`, e.file, { target: e.target || null }); continue; }
    budget.set(key, { left: (budget.get(key)?.left ?? 0) + e.count, total: (budget.get(key)?.total ?? 0) + e.count });
  }
  const active = [], suppressed = [];
  for (const f of findings) {
    const b = budget.get(fingerprint(f));
    if (b && b.left > 0 && f.severity !== "info") { b.left--; suppressed.push(f); } else active.push(f);
  }
  const stale = [];
  for (const [key, b] of budget) if (b.left > 0) stale.push({ key, unused: b.left });
  return { active, suppressed, stale, expiredKeys };
}

// ---------------------------------------------------------------------------------------------- scan
export function scan(rawOpts) {
  const opts = { shared: "shared", maxLines: 400, failOn: "error", ignore: [], ...rawOpts };
  const root = path.resolve(opts.root);
  if (!fs.existsSync(root)) throw new Error(`source root not found: ${root}`);
  const { file: cfgFile, config } = readFeConfig(root, opts);
  const cfgDir = cfgFile ? path.dirname(cfgFile) : root;
  const featuresOpt = opts.features ?? config.features ?? null;
  const sharedOpt = rawOpts.shared !== undefined && rawOpts.shared !== "shared" ? opts.shared : (config.shared ?? opts.shared);
  const maxLines = rawOpts.maxLines !== undefined && rawOpts.maxLines !== 400 ? opts.maxLines : (config.maxLines ?? opts.maxLines);
  const ruleLevel = (rule, sev) => config.rules?.[rule] ?? sev;

  const files = walk(root);
  const fileSet = new Set(files);
  const projectCfg = discoverConfigs(root, opts.tsconfig);
  const extraAliases = Object.entries(config.aliases ?? {}).map(([k, v]) => ({ pattern: k, prefix: k.endsWith("/") ? k : k + "/", wildcard: true, targets: [path.resolve(cfgDir, v) + path.sep] }))
    .flatMap((a) => [a, { ...a, prefix: a.prefix.slice(0, -1), wildcard: false, targets: [a.targets[0].slice(0, -1)] }]);
  const limitations = [...projectCfg.limitations];
  const svelteCfg = findConfigFile(root, ["svelte.config"]);
  if (svelteCfg && !projectCfg.aliases.some((a) => a.prefix.startsWith("$lib"))) {
    const lib = path.join(path.dirname(svelteCfg), "src", "lib");
    extraAliases.push({ pattern: "$lib/*", prefix: "$lib/", wildcard: true, targets: [lib + path.sep] }, { pattern: "$lib", prefix: "$lib", wildcard: false, targets: [lib] });
    limitations.push({ id: "sveltekit-lib-default", message: "SvelteKit $lib alias not found in a tsconfig (run `svelte-kit sync`); assuming the default src/lib" });
  }
  const classify = makeClassifier({ fileSet, aliases: projectCfg.aliases, baseUrls: projectCfg.baseUrls, deps: readDependencies(root), extraAliases, root });

  const featuresDir = detectFeaturesDir(root, featuresOpt);
  const sharedDir = path.join(root, sharedOpt);
  const relCache = new Map();
  const rel = (f) => { let r = relCache.get(f); if (r === undefined) { r = path.relative(root, f).split(path.sep).join("/"); relCache.set(f, r); } return r; };
  const ignoreRes = [...(config.ignore ?? []), ...(opts.ignore ?? [])].map(globToRegExp);
  const isIgnored = (file) => ignoreRes.some((re) => re.test(rel(file)));

  const capCache = new Map();
  const capabilityOf = (file) => {
    if (!featuresDir) return null;
    let c = capCache.get(file);
    if (c === undefined) {
      const r = path.relative(featuresDir, file);
      c = r.startsWith("..") || path.isAbsolute(r) ? null : r.split(path.sep)[0];
      capCache.set(file, c);
    }
    return c;
  };
  const inShared = (file) => !path.relative(sharedDir, file).startsWith("..");

  const findings = [];
  const add = (severity, rule, message, file, extra = {}) => {
    const sev = ruleLevel(rule, severity);
    if (sev === "off") return;
    findings.push({ severity: sev, rule, message, file: file ? rel(path.isAbsolute(file) ? file : path.join(root, file)) : null, line: extra.line ?? null, target: extra.target ?? null, fix: FIXES[rule] ?? null });
  };

  // Pass 1: parse every file once, classify each specifier.
  const graph = new Map(files.map((f) => [f, new Set()]));
  const edges = []; // resolved cross-file edges, kept for the policy-dependent second pass
  const buckets = { resolved: 0, asset: 0, builtin: 0, virtual: 0, dependency: 0, "outside-root": 0, unresolved: 0, "unknown-bare": 0 };
  const unresolved = [];
  const unknownBare = new Map();
  const dynamicNonLiteral = [], globUses = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split("\n").length;
    const ignored = isIgnored(file);
    if (!ignored) {
      if (lines > maxLines) add("warn", "large-file", `${lines} lines (limit ${maxLines}); check for more than one reason to change`, file);
      if (VAGUE_RE.test(path.basename(file)) && lines > 150 && capabilityOf(file)) add("warn", "vague-bucket", `${path.basename(file)} has ${lines} lines inside a capability; find the owner of each rule and move it`, file);
    }
    if (ignored) continue;
    const { imports, dynamic, globs } = extractImports(scriptSource(source, file));
    for (const d of dynamic) dynamicNonLiteral.push({ file: rel(file), line: d.line });
    for (const g of globs) globUses.push({ file: rel(file), line: g.line, kind: g.kind });
    for (const imp of imports) {
      const c = classify(imp.spec, file);
      buckets[c.bucket]++;
      if (c.bucket === "resolved") { graph.get(file).add(c.target); edges.push({ file, target: c.target, spec: imp.spec, line: imp.line }); }
      else if (c.bucket === "unresolved") unresolved.push({ file: rel(file), line: imp.line, spec: imp.spec, reason: c.reason });
      else if (c.bucket === "unknown-bare") unknownBare.set(packageName(imp.spec), (unknownBare.get(packageName(imp.spec)) ?? 0) + 1);
      else if (c.bucket === "outside-root") add("warn", "escapes-root", `imports ${imp.spec}, which resolves outside the source root; that edge is not checked`, file, { line: imp.line, target: rel(c.target) });
    }
  }

  // Entry policy: explicit (CLI > config), else detected from how the repo already imports capabilities.
  const crossCap = edges.filter((e) => { const a = capabilityOf(e.file), b = capabilityOf(e.target); return b && a !== b; });
  const rootEntry = (file) => { const cap = capabilityOf(file); return cap && ENTRY_RE.test(path.basename(file)) && path.dirname(file) === path.join(featuresDir, cap); };
  const anyBarrel = (file) => capabilityOf(file) && ENTRY_RE.test(path.basename(file));
  const declaredRes = (config.publicEntries ?? []).map(globToRegExp);
  let policy = opts.allowSubbarrels ? "subbarrels" : (opts.entryPolicy ?? config.entryPolicy ?? null);
  let policySource = policy ? (opts.allowSubbarrels || opts.entryPolicy ? "flag" : "config") : "default";
  if (policy && !["root-only", "subbarrels", "declared"].includes(policy)) throw new Error(`unknown entry policy "${policy}" (use root-only, subbarrels, or declared)`);
  if (!policy) {
    const deep = crossCap.filter((e) => !rootEntry(e.target));
    const viaBarrel = deep.filter((e) => anyBarrel(e.target));
    if (viaBarrel.length >= 3 && viaBarrel.length / deep.length >= 0.8) { // needs real evidence: 3+ imports, 80% through barrels
      policy = "subbarrels"; policySource = "detected";
      add("info", "entry-policy-assumed", `${viaBarrel.length} of ${deep.length} cross-capability imports into non-root files go through folder-level index barrels, so the repo's convention looks like subbarrels; applying that. Set entryPolicy in fe-scan.config.json to confirm.`, null);
    } else {
      policy = "root-only";
      if (viaBarrel.length) add("info", "entry-policy-assumed", `${viaBarrel.length} cross-capability imports go through folder-level barrels but ${deep.length - viaBarrel.length} reach non-barrel files, so the convention is ambiguous; applying root-only. Set entryPolicy (root-only | subbarrels | declared) in fe-scan.config.json.`, null);
    }
  }
  const isEntry = (file) => {
    if (!capabilityOf(file)) return false;
    if (policy === "declared") return declaredRes.some((re) => re.test(rel(file)));
    if (declaredRes.some((re) => re.test(rel(file)))) return true;
    if (!ENTRY_RE.test(path.basename(file))) return false;
    return policy === "subbarrels" || rootEntry(file);
  };
  if (policy === "declared" && !declaredRes.length) throw new Error('entryPolicy "declared" needs publicEntries globs in fe-scan.config.json');

  // Pass 2: boundary rules.
  const capEdges = new Map();
  const sharedConsumers = new Map();
  // A capability that declares no public entry under the default or detected policy has no contract to violate: imports
  // from the composition layer (outside every capability and outside shared/) are reported as "unguarded", not as
  // deep imports. Capability-to-capability and shared-to-capability edges are still checked, and an explicitly
  // configured policy (flag or config) is always enforced as written.
  const capsWithEntry = new Set(files.filter((f) => isEntry(f)).map(capabilityOf));
  const unguarded = new Map();
  for (const e of edges) {
    const fromCap = capabilityOf(e.file), toCap = capabilityOf(e.target);
    if (toCap && toCap !== fromCap) {
      const compositionLayer = !fromCap && !inShared(e.file);
      if (!isEntry(e.target) && compositionLayer && !capsWithEntry.has(toCap) && policySource !== "flag" && policySource !== "config") {
        unguarded.set(toCap, (unguarded.get(toCap) ?? 0) + 1);
      } else if (!isEntry(e.target)) add("error", "deep-import", `imports ${rel(e.target)} inside capability "${toCap}"; use its public entry`, e.file, { line: e.line, target: rel(e.target) });
      if (fromCap) { const key = `${fromCap}->${toCap}`; capEdges.set(key, (capEdges.get(key) ?? 0) + 1); }
      if (inShared(e.file)) add("error", "shared-imports-capability", `shared code imports capability "${toCap}" (${rel(e.target)}); shared must stay domain-free`, e.file, { line: e.line, target: rel(e.target) });
    }
    if (inShared(e.target) && fromCap) {
      if (!sharedConsumers.has(e.target)) sharedConsumers.set(e.target, new Set());
      sharedConsumers.get(e.target).add(fromCap);
    }
  }
  for (const [cap, n] of unguarded) add("info", "unguarded-capability", `capability "${cap}" declares no public entry, so ${n} import(s) from the composition layer reaching into it are not treated as deep imports. Add an index/public-api entry, or set entryPolicy, to enforce a contract`, null, { target: cap });
  for (const comp of stronglyConnected(files, graph)) {
    const names = comp.map(rel).sort();
    add("error", "import-cycle", `cycle across ${names.length} files: ${names.slice(0, 6).join(" <-> ")}${names.length > 6 ? " ..." : ""}`, names[0], { target: names.join(",").slice(0, 200) });
  }
  const capNodes = new Set(), capGraph = new Map();
  for (const key of capEdges.keys()) {
    const [a, b] = key.split("->");
    capNodes.add(a); capNodes.add(b);
    if (!capGraph.has(a)) capGraph.set(a, new Set());
    capGraph.get(a).add(b);
  }
  for (const comp of stronglyConnected([...capNodes], capGraph)) add("warn", "capability-cycle", `capabilities depend on each other: ${comp.sort().join(" <-> ")}; extract the shared concept or lift coordination`, null, { target: comp.join(",") });
  const fanOut = new Map();
  for (const key of capEdges.keys()) { const [a] = key.split("->"); fanOut.set(a, (fanOut.get(a) ?? 0) + 1); }
  for (const [cap, n] of fanOut) if (n >= 3) add("warn", "high-fan-out", `capability "${cap}" imports ${n} other capabilities; coordination may belong in the composition layer`, null, { target: cap });
  for (const [file, caps] of sharedConsumers) if (caps.size === 1) add("info", "single-consumer-shared", `used only by capability "${[...caps][0]}"; ladder rung 2-3 says it belongs inside that capability`, file);
  if (featuresDir && isDir(featuresDir)) {
    const byCap = new Map();
    for (const f of files) { const c = capabilityOf(f); if (c) { if (!byCap.has(c)) byCap.set(c, []); byCap.get(c).push(f); } }
    for (const cap of fs.readdirSync(featuresDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const capFiles = byCap.get(cap.name) ?? [];
      if (!capFiles.some(isEntry) && capFiles.length > 5) add("info", "no-public-entry", `capability "${cap.name}" has ${capFiles.length} files and no index/public-api entry`, null, { target: cap.name });
    }
  }
  if (!featuresDir) add("info", "no-capability-dir", "no features/modules/domains directory under the source root; boundary rules were skipped (pass --features <dir> or set features in fe-scan.config.json if capabilities live elsewhere)", null);

  // Coverage and limitations: say what was NOT examined.
  const internal = buckets.resolved + buckets.unresolved;
  const percent = internal === 0 ? 100 : Math.round((buckets.resolved / internal) * 1000) / 10;
  const byPrefix = new Map();
  for (const u of unresolved) { const p = u.spec.split("/").slice(0, u.spec.startsWith("@/") || u.spec.startsWith(".") ? 2 : 1).join("/"); byPrefix.set(p, (byPrefix.get(p) ?? 0) + 1); }
  const partial = unresolved.length > 0 || limitations.some((l) => l.id === "config-extends-missing" || l.id === "config-unreadable");
  const pkgRoot = findPackageRoot(root) ?? root;
  const has = (...names) => names.some((n) => findConfigFile(root, [n]));
  if (has("nuxt.config")) limitations.push({ id: "nuxt-auto-imports", message: "Nuxt auto-imports (components/, composables/, utils/, #imports) are not visible: use of another capability through an auto-import is not checked" });
  if (findUp(root, ["angular.json"])) limitations.push({ id: "angular-templates", message: "Angular template-only references (component selectors, pipes, directives) are not analyzed: only TypeScript imports are checked" });
  if (findUp(root, ["artisan"]) || isFile(path.join(pkgRoot, "composer.json"))) limitations.push({ id: "laravel-generated", message: "Laravel project: generated modules (Wayfinder @/actions, @/routes, Ziggy) are not on disk until generated; unresolved imports under those prefixes are expected until then" });
  if (findUp(root, ["pnpm-workspace.yaml", "nx.json", "turbo.json", "lerna.json"]) || (() => { try { return !!JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8")).workspaces; } catch { return false; } })()) limitations.push({ id: "monorepo-packages", message: "Workspace detected: this scan covers one source root. Package `exports` and imports between packages or apps are not checked; enforce them with the package manager and a module-boundary tool (see enforcement.md)" });
  if (unresolved.some((u) => u.reason.includes("alias-shaped")) && has("vite.config", "webpack.config", "next.config", "rspack.config")) limitations.push({ id: "bundler-aliases", message: "A bundler config exists and some alias-shaped imports are unresolved: aliases defined only there (vite.config resolve.alias) are not read. Mirror them in tsconfig paths or `aliases` in fe-scan.config.json" });
  if (dynamicNonLiteral.length) limitations.push({ id: "dynamic-imports", message: `${dynamicNonLiteral.length} import() call(s) with a non-literal argument are not followed (first: ${dynamicNonLiteral[0].file}:${dynamicNonLiteral[0].line})` });
  if (globUses.length) limitations.push({ id: "glob-imports", message: `${globUses.length} import.meta.glob / require.context call(s) pull in files by pattern and are not followed (first: ${globUses[0].file}:${globUses[0].line})` });
  limitations.push({ id: "static-only", message: "Only static imports, re-exports, literal import() and literal require() are read; framework template references and runtime-computed paths are not" });

  // Baseline / exceptions
  const today = (opts.now ?? new Date().toISOString().slice(0, 10));
  const entries = [];
  for (const e of config.exceptions ?? []) {
    if (!e.reason || !String(e.reason).trim()) throw new Error(`exception ${e.rule} ${e.file}: a reason is required`);
    entries.push({ rule: e.rule, file: e.file, target: e.target ?? "", count: e.count ?? 1, reason: e.reason, expires: e.expires ?? null });
  }
  const baselinePath = opts.baseline ?? (config.baseline ? path.resolve(cfgDir, config.baseline) : null);
  if (baselinePath && isFile(baselinePath)) entries.push(...loadBaseline(baselinePath));
  else if (baselinePath && !opts.writeBaseline) throw new Error(`baseline file not found: ${baselinePath} (create it with --write-baseline)`);
  let active = findings, suppressed = [], stale = [];
  if (entries.length) {
    const r = applyExceptions(findings, entries, today, add);
    suppressed = r.suppressed; stale = r.stale;
    for (const s of stale) { const [rule, file, target] = s.key.split("|"); add("warn", "stale-baseline", `baseline expects ${s.unused} more ${rule} in ${file}${target ? " -> " + target : ""} than exist now; the violation was fixed or moved`, file || null); }
    active = findings.filter((f) => !suppressed.includes(f));
  }

  const counts = { error: 0, warn: 0, info: 0, suppressed: suppressed.length };
  for (const f of active) counts[f.severity]++;
  const coverageStatus = partial ? "partial" : "complete";
  const status = counts.error ? "fail" : partial ? "partial" : "pass";
  return {
    version: SCANNER_VERSION, root, files: files.length,
    tsconfig: projectCfg.used[0] ?? null, configs: projectCfg.used, feConfig: cfgFile, featuresDir: featuresDir ? rel(featuresDir) : null,
    entryPolicy: { policy, source: policySource },
    unresolvedImports: unresolved.length,
    status,
    coverage: { status: coverageStatus, percent, projectImports: internal, buckets, unresolvedByPrefix: [...byPrefix].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([prefix, count]) => ({ prefix, count })), unresolved: unresolved.slice(0, 50), unknownBare: [...unknownBare].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })) },
    limitations,
    baseline: baselinePath || entries.length ? { file: baselinePath, suppressed: suppressed.length, stale: stale.length } : null,
    counts, findings: active, suppressed, capabilityEdges: Object.fromEntries(capEdges),
  };
}

/** Write the current error/warn findings as a baseline (count-aware, reasons preserved from an existing file). */
export function writeBaseline(result, file, now = new Date().toISOString().slice(0, 10)) {
  let previous = [];
  try { previous = loadBaseline(file); } catch { /* new baseline */ }
  const prior = new Map(previous.map((e) => [fingerprint(e), e]));
  const groups = new Map();
  for (const f of [...result.findings, ...result.suppressed].filter((x) => x.severity !== "info" && x.rule !== "stale-baseline" && x.rule !== "exception-expired")) groups.set(fingerprint(f), [...(groups.get(fingerprint(f)) ?? []), f]);
  const entries = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => {
    const f = list[0], p = prior.get(key);
    return { rule: f.rule, file: f.file, target: f.target ?? "", count: list.length, reason: p?.reason ?? `baselined ${now}: existing violation, fix or renew`, expires: p?.expires ?? null };
  });
  fs.writeFileSync(file, JSON.stringify({ version: 1, generated: now, entries }, null, 2) + "\n");
  return entries.length;
}

// ---------------------------------------------------------------------------------------------- output
export function format(result, { limit = 8, all = false } = {}) {
  const out = [];
  out.push(`fe-scan ${result.version}: ${result.files} files under ${result.root}`);
  out.push(`capabilities dir: ${result.featuresDir ?? "none"}; entry policy: ${result.entryPolicy.policy} (${result.entryPolicy.source}); configs: ${result.configs.length ? result.configs.map((c) => path.basename(c)).join(", ") : "none"}`);
  const c = result.coverage;
  out.push(`coverage: ${c.status.toUpperCase()}, ${c.percent}% of ${c.projectImports} project-internal imports resolved; unresolved: ${result.unresolvedImports}; external: ${c.buckets.dependency} dependency, ${c.buckets.builtin} builtin, ${c.buckets.virtual} virtual, ${c.buckets.asset} asset`);
  if (result.unresolvedImports) {
    out.push("", `COVERAGE GAP: ${result.unresolvedImports} project-internal import(s) could not be resolved, so boundary results below are INCOMPLETE. Do not report a pass.`);
    for (const p of c.unresolvedByPrefix) out.push(`  ${p.prefix} x${p.count}`);
    for (const u of c.unresolved.slice(0, all ? 50 : 3)) out.push(`    ${u.file}:${u.line}: ${u.spec} (${u.reason})`);
  }
  const labels = { error: "VIOLATIONS", warn: "WARNINGS", info: "INFO" };
  for (const sev of SEVERITIES) {
    const list = result.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    out.push("", `${labels[sev]} (${list.length})`);
    const byRule = new Map();
    for (const f of list) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
    for (const [rule, items] of byRule) {
      out.push(`  [${rule}] x${items.length}${items[0].fix ? `  fix: ${items[0].fix}` : ""}`);
      for (const f of all ? items : items.slice(0, limit)) out.push(`    ${f.file ? f.file + (f.line ? ":" + f.line : "") + ": " : ""}${f.message}`);
      if (!all && items.length > limit) out.push(`    ... ${items.length - limit} more (use --all)`);
    }
  }
  if (result.baseline) out.push("", `BASELINE ${result.baseline.file ?? "(config exceptions)"}: ${result.baseline.suppressed} suppressed, ${result.baseline.stale} stale. Suppressed findings are known debt, not passes.`);
  out.push("", `NOT CHECKED (${result.limitations.length})`);
  for (const l of result.limitations) out.push(`  - ${l.message}`);
  const verdict = result.status === "fail" ? "FAIL" : result.status === "partial" ? "INCOMPLETE (no violations found in the files that could be resolved)" : "PASS within the checked scope";
  out.push("", `summary: ${result.counts.error} error, ${result.counts.warn} warn, ${result.counts.info} info${result.counts.suppressed ? `, ${result.counts.suppressed} baselined` : ""}; result: ${verdict}`);
  return out.join("\n");
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const invoked = !!process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url));
if (invoked) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`fe-scan: ${e.message}\n${USAGE}`); process.exit(2); }
  if (opts.help) { console.log(USAGE); process.exit(0); }
  if (!opts.root) { console.error(USAGE); process.exit(2); }
  try {
    const result = scan(opts);
    if (opts.writeBaseline) {
      const n = writeBaseline(result, path.resolve(opts.writeBaseline));
      console.log(`fe-scan: wrote ${n} baseline entr${n === 1 ? "y" : "ies"} to ${opts.writeBaseline}. Review the reasons, commit the file, and run CI with --baseline.`);
      process.exit(0);
    }
    console.log(opts.json ? JSON.stringify(result, null, 2) : format(result, opts));
    const violated = (opts.failOn === "error" && result.counts.error) || (opts.failOn === "warn" && (result.counts.error || result.counts.warn));
    const belowCoverage = opts.minCoverage !== null && result.coverage.percent < opts.minCoverage;
    process.exit(violated ? 1 : belowCoverage ? 3 : 0);
  } catch (e) {
    console.error(`fe-scan failed: ${e.message}`);
    process.exit(2);
  }
}
