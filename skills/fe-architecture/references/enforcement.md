# Enforcement and verification

**Why it exists:** Turns boundaries into checks tooling can run, so rules do not live only in documentation.
**Use when:** at the Enforce step, or before adding import or cycle rules.
**Do not use when:** the task is advisory only (report `not run: advisory task`) or no boundary changed.

Prefer machine-enforced boundaries. Add missing tooling/configuration when requested or when a scoped boundary refactor includes its regression rule; otherwise recommend the concrete change. Use the repo's package manager and installed versions. Never install tools automatically just to make a report green.

## Discover and run

1. Read root/workspace package scripts, lint configuration, TS paths, and CI. Resolve the actual source root from the profile or `tsconfig`; a monorepo app root is not the repository root.
2. Run existing lint, typecheck, tests, build, and cycle checks. Use workspace equivalents when the task scope warrants them, and state their scope. TypeScript's basic check is `tsc --noEmit`; prefer the existing script that adds project options.
3. Report command, result, and relevant limitations. Distinguish failed, unavailable, and not run. Never claim a check passed unless it ran; a cached task is a cached result, not fresh execution.
4. After changing rules, verify allowed imports still pass and forbidden edges fail, including aliases, relative paths, re-exports, and runtime-specific entry points. Resolve imports for robust architectural enforcement; text patterns alone do not establish privacy.

Take script names from the profile or `package.json`; rediscover them each run because they change. Report a cycle check as `unavailable` when the project provides none, and offer the scanner (`fe-architecture/scripts/fe-scan.mjs`) as a dependency-free fallback. It lives in the skills directory, so copy it into the project (for example `scripts/fe-scan.mjs`) before CI references it.

Configuration examples (ESLint minimal and owner-scoped, dependency-cruiser, Madge) are in [enforcement configs](enforcement-configs.md); read them only when adding or changing a rule.

## Public paths: expose roots

```json
{
  "compilerOptions": {
    "paths": {
      "@/features/chat": ["./src/features/chat/index.ts"],
      "@/features/search": ["./src/features/search/index.ts"],
      "@/shared/ui": ["./src/shared/ui/index.ts"]
    }
  }
}
```

Do not add aliases to internals. Avoid a catch-all feature alias in new boundary configurations; `@/*` also permits deep imports despite an exact root alias. TS paths route module resolution; they do **not** enforce privacy or prevent relative imports. Match bundler/test resolver settings, and migrate existing aliases only within the authorized scope. When a project already uses `@/*`, retain it during unrelated work and enforce resolved boundaries separately.

| Tool/choice               | Problem solved                      | Cost                        | When not to use                            | Misuse failure                          |
| ------------------------- | ----------------------------------- | --------------------------- | ------------------------------------------ | --------------------------------------- |
| Import-string lint        | Fast feedback on known import paths | Scoped pattern maintenance  | Sole protection against all imports        | Relative paths bypass the rule          |
| Resolved dependency rules | Cross-module privacy and cycles     | Resolver/config maintenance | Simple local change with no boundary issue | Unresolved imports hide forbidden edges |
| Explicit TS aliases       | Discoverable public entry points    | Alias/resolver coordination | Broad alias migration unrelated to task    | Treated as a privacy/security mechanism |

## The scanner: what it checks, what it cannot see

`fe-scan.mjs <sourceRoot>` reads imports with a small lexer (comments, strings, template and regex literals are skipped; `.vue` and `.svelte` read only `<script>`). It checks deep imports into a capability, shared code importing capabilities, file and capability cycles, fan-out, single-consumer shared files, oversized files, vague buckets, and relative imports that escape the source root.

**Read the coverage line first.** Every import is classified as resolved, asset, builtin, declared dependency, virtual (`$app/*`, `virtual:*`, `#imports`), outside the root, unknown package, or **unresolved project import** (relative or alias-shaped but not found). Unresolved imports mean the boundary results are **partial**: say so, name the top unresolved prefixes, and do not report Pass. Typical causes: aliases only in `vite.config`, generated modules not yet generated (Wayfinder, `svelte-kit sync`), or a config the scanner could not read. Fix the cause, or add `aliases` in `fe-scan.config.json`.

The report ends with a **NOT CHECKED** list (Nuxt auto-imports, Angular templates, `import.meta.glob`, non-literal `import()`, workspace packages). Copy it into the report's "Not checked" line.

Discovery: `tsconfig*.json` and `jsconfig.json` from the source root up to the package root, following `extends` and project `references`; a missing generated `extends` target is a coverage limitation.

| Need | Option |
| ---- | ------ |
| CI that fails on partial scans | `--strict-coverage` (or `--min-coverage 95`): exit 3 |
| Adopt in a legacy repo | `--write-baseline fe-scan.baseline.json`, commit it, run CI with `--baseline`; only new violations fail |
| Generated or vendor code | `ignore` globs in `fe-scan.config.json` (still resolvable as targets, never reported as sources) |
| Allow with a reason | `exceptions: [{rule, file, target, reason, expires}]`; a reason is required, expired ones fail again |
| Rule severity | `rules: { "large-file": "off" }` |
| Aliases the tsconfig lacks | `aliases: { "@app": "src" }` |

Baselines are count-aware and keyed by rule, file, and target (not line number). Entries whose violation is gone are reported as `stale-baseline`; rewriting the baseline drops them and keeps hand-written reasons. Baselined findings are listed as known debt, never as passes.

### Public-entry policy

The scanner needs to know what counts as a capability's public entry: `entryPolicy` in `fe-scan.config.json` (or `--entry-policy`):

- `root-only` (default): only the capability's root `index.*` or `public-api.*`.
- `subbarrels`: any `index.*` inside the capability (`--allow-subbarrels` is the older alias).
- `declared`: only files matching `publicEntries` globs (relative to the source root).

When unset, the scanner detects the repo's convention: 3+ cross-capability imports into non-root files with at least 80% through folder barrels selects `subbarrels` and reports an `entry-policy-assumed` finding; a mixed picture keeps `root-only` and asks for an explicit setting. Prefer the policy the repo already follows; change it only where a boundary is actually violated.

### Other layouts

Layered (`ui/domain/data`), Feature-Sliced Design, and domain modules can satisfy the same invariants: one owner per datum, dependencies pointing one way, one public contract per unit. The scanner checks only import direction through capability public entries, so point `features` at the layout's unit directory (for FSD, the slices directory) and use `declared` entries. Layer-direction rules (FSD's "upper imports lower") are not checked; use `eslint-plugin-boundaries`, Steiger, or `dependency-cruiser` for those.

## Monorepos and package boundaries

The scanner covers one source root. It warns when a relative import leaves that root (`escapes-root`) and lists the workspace as not checked. It does not read package `exports`, does not see `@scope/pkg/src/internal` deep imports into a workspace package, and does not enforce "apps never import apps". Enforce those with: package `exports` maps (so internals cannot be imported at all), a module-boundary tool (Nx `enforce-module-boundaries`, `dependency-cruiser`, `eslint-plugin-boundaries`, Sheriff) configured per package, and one scan per app root.
