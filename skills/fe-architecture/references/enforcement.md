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
