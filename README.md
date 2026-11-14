# frontend-architecture-skills

Agent skills that give a frontend one consistent architecture model: who owns each piece of state and behavior, where code lives, which imports are allowed, and how to prove the boundaries hold. Includes a dependency-free scanner that reports what it checked and what it could not.

## Who this is for

- Teams using AI coding agents on a frontend who want new code placed consistently, with import boundaries checked by a tool rather than prose.
- Developers adopting boundaries in an existing app without a big-bang rewrite (baselines, ignore globs, exceptions with reasons).

**Not for:** a scaffolding or project generator, a design-system or styling skill, micro-frontend or monorepo graph tooling, or teams already enforcing boundaries well with Nx, Feature-Sliced Design with Steiger, or `eslint-plugin-boundaries` (use this for the ownership model and review workflows, not instead of those tools).

## Skills

| Skill                | Invoked by | Job                                                                                   |
| -------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `fe-architecture`    | model      | The single home of the model: ladder, levels, state rules, trust rules, references, scanner |
| `fe-apply-feature`   | you        | Build or change a feature, or start a new app or capability, with named owners        |
| `fe-check-structure` | you        | Read-only audit: scanner plus manual checks, ranked report with coverage              |
| `fe-restructure`     | you        | Baseline, diagnose, move in small batches, add a regression rule, prove it            |
| `fe-review`          | you        | Review a diff against the model; scanner delta against the merge base                 |
| `fe-decide`          | you        | One-way-door decisions with a scored rubric and a decision record                     |
| `fe-enforce`         | you        | Generate boundary rules, prove them with negative tests, wire into CI                 |
| `fe-init-profile`    | you        | Write `docs/frontend-architecture.md`, the project facts every skill reads            |

Which one to run: build or change something (`fe-apply-feature`), audit (`fe-check-structure`), fix a smell (`fe-restructure`), review a PR (`fe-review`), choose a framework or library (`fe-decide`), turn rules into CI checks (`fe-enforce`), first run in a repo (`fe-init-profile`, then `fe-check-structure`). In Claude Code you must type the slash form, `/fe-apply-feature <what to build>` (`/fe-arch:fe-apply-feature` when installed as a plugin): the workflow skills are user-invoked, and Claude Code refuses to let the model load them when you only name them in prose (observed in the evals). In other agents, name the skill in your prompt (Codex: `$fe-review`).

Design rules: the model is defined once (`fe-architecture`); workflow skills carry only an order of work with a completion criterion per step, scaled by the level of the capability touched; project facts live in the target repo's profile, never in the skills.

## Install

Claude Code plugin (skills are namespaced `/fe-arch:<skill>`):

```bash
claude plugin marketplace add a2mby/frontend-architecture-skills
claude plugin install fe-arch@fe-architecture-skills
```

Update with `claude plugin update fe-arch@fe-architecture-skills`. Verified locally for a local-path marketplace; installing from GitHub works once the repository carries this version.

Any agent that reads `SKILL.md` folders (Node 22+, macOS, Linux, Windows):

```bash
node scripts/install.mjs                           # ~/.claude/skills
node scripts/install.mjs --target agents           # ~/.agents/skills (Codex, Cursor, OpenCode, Gemini CLI, Copilot)
node scripts/install.mjs --scope project           # ./.claude/skills in the current project
node scripts/install.mjs --dir /custom/skills      # explicit destination
node scripts/install.mjs --update                  # upgrade what this installer installed
node scripts/install.mjs --uninstall               # remove only what it installed
node scripts/install.mjs --list                    # installed versions
```

The installer stamps each directory with `.fe-skills.json`; it refuses same-name directories it did not install, keeps locally modified files unless `--overwrite-modified`, and never touches other skills. Upgrading from 0.1.0's `install.sh`: see the [changelog](CHANGELOG.md).

## Supported agents

Verified in a real run: **Claude Code** (manual install). Partially observed: Claude Code plugin, Cursor, OpenCode. Untested: Codex, GitHub Copilot, Gemini CLI. The matrix, evidence, and what differs per agent (invocation control, arguments) is in [docs/compatibility.md](docs/compatibility.md).

## Quick start

1. `fe-init-profile`: writes `docs/frontend-architecture.md` (project facts, debt, enforced boundaries).
2. `fe-check-structure`: ranked report. Read the **coverage** line and the **NOT CHECKED** list before the findings.
3. Adopting in a legacy app: `fe-enforce` baselines existing violations so CI fails only on new ones.

Example: asking "add a settings area with 3 tabs sharing one saved form" yields Moderate (3 workflows, shared form and API), one owner for the saved form with unsaved edits as a draft, a tripwire for promoting to Complex, and no Module Map. A new empty app yields a flat Simple structure with `(proposed)` paths and no `features/` folder until a capability earns one.

## The scanner

```bash
node skills/fe-architecture/scripts/fe-scan.mjs <sourceRoot> [--baseline f] [--strict-coverage] [--json]
```

No dependencies, Node 22+. It checks deep imports into a capability, shared code importing capabilities, file and capability cycles, fan-out, single-consumer `shared/` files, oversized files, vague buckets, and imports that escape the source root.

What makes a result trustworthy:

- Discovers `tsconfig*.json` and `jsconfig.json` (with `extends` and project `references`), classifies every import (resolved, asset, builtin, declared dependency, virtual, outside the root, unknown package, **unresolved project import**), and prints a coverage verdict. Unresolved project imports make the result `INCOMPLETE`, never a pass. `--strict-coverage` / `--min-coverage N` exit 3.
- Ends every report with **NOT CHECKED**: Nuxt auto-imports, Angular template-only references, `import.meta.glob`, non-literal `import()`, workspace packages and `exports`.
- Reads imports with a lexer, not a regex: imports in comments, strings, and template literals are ignored; `.vue` and `.svelte` read only `<script>`.
- Entry policy is detected from how the repo already imports (`root-only`, `subbarrels`, or `declared` via config) and reported as an assumption.

Incremental adoption: `--write-baseline fe-scan.baseline.json`, commit it, then `--baseline fe-scan.baseline.json` in CI. Entries are count-aware, carry a reason (and optional `expires`), stale entries are reported, and baselined findings are listed as known debt. `fe-scan.config.json` holds `ignore` globs for generated code, `entryPolicy`, `publicEntries`, `aliases`, rule severities, and exceptions. Details: [enforcement reference](skills/fe-architecture/references/enforcement.md).

## Frameworks

Written guidance for React and Next.js, Vue and Nuxt, Svelte and SvelteKit, Angular, and Laravel + Inertia (React or Vue). The scanner is exercised in tests on Vite React, Next.js-shaped layouts, Laravel + Inertia, SvelteKit (with and without generated config), Angular, Vue, and a workspace layout; guidance for the others rests on documentation and one agent eval each at most. Not covered: Solid, Qwik, vanilla, Livewire.

## Troubleshooting

| Symptom | Cause and fix |
| ------- | ------------- |
| `coverage: PARTIAL`, `COVERAGE GAP` | Alias-shaped imports with no matching alias. Add the alias to `tsconfig`/`jsconfig`, or `aliases` in `fe-scan.config.json`; generate generated modules first (`svelte-kit sync`, Wayfinder) |
| Many `deep-import` errors on a healthy repo | The repo imports through folder-level barrels: set `entryPolicy` to `subbarrels` (or `declared` with `publicEntries`) |
| Cycles inside `components/ui` | Generated barrels (shadcn): add the folder to `ignore` |
| `no-capability-dir` | No `features/` folder: fine for Simple apps, or pass `--features <dir>` |
| Workflow skill ran by itself in an agent | That agent ignores `disable-model-invocation`; see the compatibility matrix |
| Installer refuses a directory | A same-name directory not installed by this package exists; rename it, or `--update --adopt-legacy` for a 0.1.0 install |

## Limitations

The scanner is static and per source root: it does not see runtime-computed imports, framework auto-imports, template-only references, or cross-package imports, and it is not a type checker. Skill behavior beyond the [recorded evals](evals/RESULTS.md) is unmeasured: few trials, one model, graded by patterns. See also [docs/real-world-validation.md](docs/real-world-validation.md) for a reproducible public scan and its false positives.

## Verify the package

```bash
npm run check    # validate-package (spec rules, budgets, links, single source, manifests, installed layout) + all tests
```

Agent evals (manual, costs money): [evals/README.md](evals/README.md). Contributing, versioning, and release policy: [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md). License: MIT.

## Layout

```text
skills/<name>/SKILL.md        the skills (fe-architecture holds references/, assets/, scripts/)
skills/<name>/agents/         Codex adapter (openai.yaml) for each workflow skill
skills/fe-review/scripts/     scan-delta.mjs: scanner delta against the merge base
scripts/                      install.mjs, validate-package.mjs
tests/                        node:test suites and fixtures
evals/                        agent evals, fixtures, results
docs/                         compatibility matrix, real-world validation
.claude-plugin/               plugin.json, marketplace.json
```
