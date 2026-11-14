#!/usr/bin/env node
// fe-scan: dependency-free structure scanner for frontend capability boundaries.
// Usage: node fe-scan.mjs <sourceRoot> [--features <dir>] [--tsconfig <file>] [--shared <dir>]
//        [--max-lines 400] [--limit 8] [--all] [--allow-subbarrels] [--json] [--fail-on error|warn|never]
// Reads import statements with a regex (not a full parser): treat output as evidence to confirm, not proof.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".vue", ".svelte"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".nuxt", ".svelte-kit", "dist", "build", "coverage", ".turbo", ".git", ".output"]);
const ENTRY_RE = /^(index|public-api)(\.[a-z]+)?\.(ts|tsx|js|jsx|mjs|mts|vue|svelte)$/;
const VAGUE_RE = /^(utils?|helpers?|common|misc|lib)\.(ts|tsx|js|jsx)$/;

export function parseArgs(argv) {
  const opts = { root: null, features: null, tsconfig: null, shared: "shared", maxLines: 400, json: false, failOn: "error", limit: 8, all: false, allowSubbarrels: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--features") opts.features = argv[++i];
    else if (a === "--tsconfig") opts.tsconfig = argv[++i];
    else if (a === "--shared") opts.shared = argv[++i];
    else if (a === "--max-lines") opts.maxLines = Number(argv[++i]);
    else if (a === "--fail-on") opts.failOn = argv[++i];
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a === "--all") opts.all = true;
    else if (a === "--allow-subbarrels") opts.allowSubbarrels = true;
    else rest.push(a);
  }
  opts.root = rest[0] ?? null;
  return opts;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (EXT.includes(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

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

function resolveExtends(from, spec) {
  const base = spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  const candidates = [];
  if (base) candidates.push(base, base + ".json");
  else {
    let dir = path.dirname(from);
    for (let i = 0; i < 8; i++) {
      candidates.push(path.join(dir, "node_modules", spec), path.join(dir, "node_modules", spec + ".json"));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

function loadCompilerOptions(file, depth = 0) {
  const json = JSON.parse(stripJsonc(fs.readFileSync(file, "utf8")));
  let merged = {};
  const parents = depth < 5 && json.extends ? [].concat(json.extends) : [];
  for (const spec of parents) {
    const parent = resolveExtends(file, spec);
    if (parent) merged = { ...merged, ...loadCompilerOptions(parent, depth + 1) };
  }
  const own = json.compilerOptions ?? {};
  // `paths` resolves against baseUrl, or against the tsconfig that declares it.
  const declaredDir = path.dirname(file);
  const baseUrl = own.baseUrl !== undefined ? path.resolve(declaredDir, own.baseUrl) : merged.baseUrl;
  const pathsBase = own.paths !== undefined ? (baseUrl ?? declaredDir) : merged.pathsBase;
  return { ...merged, ...own, baseUrl, pathsBase, paths: own.paths ?? merged.paths };
}

function readTsconfig(file) {
  try {
    const co = loadCompilerOptions(file);
    return { baseUrl: co.pathsBase ?? co.baseUrl ?? path.dirname(file), paths: co.paths ?? {} };
  } catch {
    return null;
  }
}

function findTsconfig(root, explicit) {
  if (explicit) return explicit;
  let dir = path.resolve(root);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "tsconfig.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const IMPORT_RES = [
  /\b(?:import|export)\s+(type\s+)?(?:[^'"()]*?\sfrom\s*)?["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
];

function extractImports(source) {
  const specs = [];
  for (const re of IMPORT_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source))) specs.push(m[m.length - 1]);
  }
  return specs;
}

function tryFile(base, fileSet) {
  const candidates = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => path.join(base, "index" + e))];
  return candidates.find((c) => fileSet.has(c)) ?? null;
}

function makeResolver(fileSet, tsconfig) {
  const aliases = tsconfig
    ? Object.entries(tsconfig.paths).map(([pattern, targets]) => ({
        prefix: pattern.replace(/\*$/, ""),
        wildcard: pattern.endsWith("*"),
        targets: targets.map((t) => t.replace(/\*$/, "")),
      }))
    : [];
  return (spec, fromFile) => {
    if (spec.startsWith(".")) return tryFile(path.resolve(path.dirname(fromFile), spec), fileSet);
    for (const a of aliases) {
      if (a.wildcard ? spec.startsWith(a.prefix) : spec === a.prefix) {
        const tail = a.wildcard ? spec.slice(a.prefix.length) : "";
        for (const t of a.targets) {
          const hit = tryFile(path.resolve(tsconfig.baseUrl, t + tail), fileSet);
          if (hit) return hit;
        }
      }
    }
    return null; // external package or unresolved alias
  };
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

export function scan(opts) {
  const root = path.resolve(opts.root);
  if (!fs.existsSync(root)) throw new Error(`source root not found: ${root}`);
  const files = walk(root);
  const fileSet = new Set(files);
  const tsPath = findTsconfig(root, opts.tsconfig);
  const tsconfig = tsPath ? readTsconfig(tsPath) : null;
  const resolve = makeResolver(fileSet, tsconfig);
  const featuresDir = detectFeaturesDir(root, opts.features);
  const sharedDir = path.join(root, opts.shared);
  const rel = (f) => path.relative(root, f).split(path.sep).join("/");

  const capabilityOf = (file) => {
    if (!featuresDir) return null;
    const r = path.relative(featuresDir, file);
    if (r.startsWith("..") || path.isAbsolute(r)) return null;
    return r.split(path.sep)[0];
  };
  const isEntry = (file) => {
    const cap = capabilityOf(file);
    if (!cap || !ENTRY_RE.test(path.basename(file))) return false;
    // Strict: only the capability root entry is public. --allow-subbarrels accepts any index.* inside it.
    return opts.allowSubbarrels || path.dirname(file) === path.join(featuresDir, cap);
  };
  const inShared = (file) => !path.relative(sharedDir, file).startsWith("..");

  const graph = new Map(files.map((f) => [f, new Set()]));
  const findings = [];
  const add = (severity, rule, message, file) => findings.push({ severity, rule, message, file: file ? rel(file) : null });
  const capEdges = new Map(); // "a->b" -> count
  const sharedConsumers = new Map(); // shared file -> Set(capability)
  let unresolved = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split("\n").length;
    if (lines > opts.maxLines) add("warn", "large-file", `${lines} lines (limit ${opts.maxLines}); check for more than one reason to change`, file);
    if (VAGUE_RE.test(path.basename(file)) && lines > 150 && capabilityOf(file)) {
      add("warn", "vague-bucket", `${path.basename(file)} has ${lines} lines inside a capability; find the owner of each rule and move it`, file);
    }
    const fromCap = capabilityOf(file);
    for (const spec of extractImports(source)) {
      const target = resolve(spec, file);
      if (!target) { if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("~/")) unresolved++; continue; }
      graph.get(file).add(target);
      const toCap = capabilityOf(target);
      if (toCap && toCap !== fromCap) {
        if (!isEntry(target)) add("error", "deep-import", `imports ${rel(target)} inside capability "${toCap}"; use its public entry`, file);
        if (fromCap) {
          const key = `${fromCap}->${toCap}`;
          capEdges.set(key, (capEdges.get(key) ?? 0) + 1);
        }
        if (inShared(file)) add("error", "shared-imports-capability", `shared code imports capability "${toCap}" (${rel(target)}); shared must stay domain-free`, file);
      }
      if (inShared(target) && fromCap) {
        if (!sharedConsumers.has(target)) sharedConsumers.set(target, new Set());
        sharedConsumers.get(target).add(fromCap);
      }
    }
  }

  for (const comp of stronglyConnected(files, graph)) {
    const names = comp.map(rel).sort();
    add("error", "import-cycle", `cycle across ${names.length} files: ${names.slice(0, 6).join(" <-> ")}${names.length > 6 ? " ..." : ""}`, comp[0]);
  }

  const capNodes = new Set();
  const capGraph = new Map();
  for (const key of capEdges.keys()) {
    const [a, b] = key.split("->");
    capNodes.add(a); capNodes.add(b);
    if (!capGraph.has(a)) capGraph.set(a, new Set());
    capGraph.get(a).add(b);
  }
  for (const comp of stronglyConnected([...capNodes], capGraph)) {
    add("warn", "capability-cycle", `capabilities depend on each other: ${comp.sort().join(" <-> ")}; extract the shared concept or lift coordination`, null);
  }
  const fanOut = new Map();
  for (const key of capEdges.keys()) { const [a] = key.split("->"); fanOut.set(a, (fanOut.get(a) ?? 0) + 1); }
  for (const [cap, n] of fanOut) if (n >= 3) add("warn", "high-fan-out", `capability "${cap}" imports ${n} other capabilities; coordination may belong in the composition layer`, null);

  for (const [file, caps] of sharedConsumers) {
    if (caps.size === 1) add("info", "single-consumer-shared", `used only by capability "${[...caps][0]}"; ladder rung 2-3 says it belongs inside that capability`, file);
  }

  if (featuresDir) {
    for (const cap of fs.readdirSync(featuresDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const capFiles = files.filter((f) => capabilityOf(f) === cap.name);
      const hasEntry = capFiles.some(isEntry);
      if (!hasEntry && capFiles.length > 5) add("info", "no-public-entry", `capability "${cap.name}" has ${capFiles.length} files and no index/public-api entry`, null);
    }
  }
  if (!featuresDir) add("info", "no-capability-dir", "no features/modules/domains directory under the source root; boundary rules were skipped (pass --features <dir> if capabilities live elsewhere)", null);

  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return { root, files: files.length, tsconfig: tsPath, featuresDir: featuresDir ? rel(featuresDir) : null, unresolvedImports: unresolved, counts, findings, capabilityEdges: Object.fromEntries(capEdges) };
}

export function format(result, { limit = 8, all = false } = {}) {
  const out = [];
  out.push(`fe-scan: ${result.files} files under ${result.root}`);
  out.push(`capabilities dir: ${result.featuresDir ?? "none"}; tsconfig: ${result.tsconfig ?? "none"}; unresolved relative/alias imports: ${result.unresolvedImports}`);
  for (const sev of ["error", "warn", "info"]) {
    const list = result.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    out.push("", `${sev.toUpperCase()} (${list.length})`);
    const byRule = new Map();
    for (const f of list) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
    for (const [rule, items] of byRule) {
      out.push(`  [${rule}] x${items.length}`);
      for (const f of all ? items : items.slice(0, limit)) out.push(`    ${f.file ? f.file + ": " : ""}${f.message}`);
      if (!all && items.length > limit) out.push(`    ... ${items.length - limit} more (use --all)`);
    }
  }
  out.push("", `summary: ${result.counts.error} error, ${result.counts.warn} warn, ${result.counts.info} info`);
  return out.join("\n");
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const invoked = !!process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url));
if (invoked) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.root) {
    console.error("usage: node fe-scan.mjs <sourceRoot> [--features <dir>] [--tsconfig <file>] [--shared <dir>] [--max-lines N] [--limit N] [--all] [--allow-subbarrels] [--json] [--fail-on error|warn|never]");
    process.exit(2);
  }
  try {
    const result = scan(opts);
    console.log(opts.json ? JSON.stringify(result, null, 2) : format(result, opts));
    const fail = (opts.failOn === "error" && result.counts.error) || (opts.failOn === "warn" && (result.counts.error || result.counts.warn));
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error(`fe-scan failed: ${e.message}`);
    process.exit(2);
  }
}
