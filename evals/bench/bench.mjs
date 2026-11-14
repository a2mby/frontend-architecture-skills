#!/usr/bin/env node
// Scanner benchmark on synthetic repositories of increasing size. Each size runs in its own child process so
// peak memory (maxRSS) is not shared. Usage: node evals/bench/bench.mjs [sizes...]   (default 1000 5000 20000 50000)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const scanner = path.join(here, "..", "..", "skills", "fe-architecture", "scripts", "fe-scan.mjs");

if (process.argv[2] === "--child") {
  const { scan } = await import(scanner);
  const root = process.argv[3];
  const t0 = process.hrtime.bigint();
  const r = scan({ root });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(JSON.stringify({ files: r.files, ms: Math.round(ms), maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024), errors: r.counts.error, coverage: r.coverage.percent }));
  process.exit(0);
}

function generate(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fe-bench-"));
  fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }));
  const caps = Math.max(5, Math.round(Math.sqrt(n) / 2)), perCap = Math.ceil(n / caps);
  let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let c = 0; c < caps; c++) {
    const base = path.join(dir, "src", "features", `cap${c}`);
    fs.mkdirSync(path.join(base, "components"), { recursive: true });
    const exports = [];
    for (let i = 0; i < perCap; i++) {
      const rel = i === 0 ? "index.ts" : `components/f${i}.ts`;
      if (i === 0) continue;
      const imports = [];
      if (i > 1) imports.push(`import { v${i - 1} } from "./f${i - 1}";`);
      const other = Math.floor(rnd() * caps);
      if (other !== c) imports.push(`import { e${other} } from "@/features/cap${other}";`);
      imports.push(`import { s } from "@/shared/util${i % 20}";`);
      fs.writeFileSync(path.join(base, rel), `${imports.join("\n")}\nexport const v${i} = ${i};\n${"// filler line\n".repeat(20)}`);
      if (i < 4) exports.push(`export { v${i} } from "./components/f${i}";`);
    }
    fs.writeFileSync(path.join(base, "index.ts"), `${exports.join("\n")}\nexport const e${c} = ${c};\n`);
  }
  fs.mkdirSync(path.join(dir, "src", "shared"), { recursive: true });
  for (let i = 0; i < 20; i++) fs.writeFileSync(path.join(dir, "src", "shared", `util${i}.ts`), "export const s = 1;\n");
  return dir;
}

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
console.log(`node ${process.version} ${process.platform} ${os.cpus()[0]?.model ?? ""} x${os.cpus().length}`);
console.log("target files | scanned | time ms | peak RSS MB | errors | coverage");
for (const n of sizes.length ? sizes : [1000, 5000, 20000, 50000]) {
  const dir = generate(n);
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--child", path.join(dir, "src")], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) { console.log(`${n} FAILED: ${r.stderr.slice(0, 200)}`); continue; }
  const j = JSON.parse(r.stdout);
  console.log(`${String(n).padStart(12)} | ${String(j.files).padStart(7)} | ${String(j.ms).padStart(7)} | ${String(j.maxRssMb).padStart(11)} | ${String(j.errors).padStart(6)} | ${j.coverage}%`);
}
