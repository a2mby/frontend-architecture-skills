# frontend-architecture-skills

Agent skills that give a frontend one consistent architecture model: who owns each piece of state and behavior, where code lives, which imports are allowed, and how to prove the boundaries hold. Works with React, Next.js, Vue, Nuxt, Svelte, SvelteKit, and Angular.

## Skills

| Skill                | Invoked by | Job                                                                                   |
| -------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `fe-architecture`    | model      | The single home of the model: ladder, levels, state rules, notes, references, scanner |
| `fe-apply-feature`   | you        | Build or change a feature with named owners and verified boundaries                   |
| `fe-check-structure` | you        | Read-only audit: scanner plus manual checks, ranked report                            |
| `fe-restructure`     | you        | Baseline, diagnose, move in small batches, add a regression rule, prove it            |
| `fe-review`          | you        | Review a diff against the model; scan delta between base and head                     |
| `fe-decide`          | you        | One-way-door decisions with a scored rubric and a decision record                     |
| `fe-enforce`         | you        | Generate boundary rules, prove them with negative tests, wire into CI                 |
| `fe-init-profile`    | you        | Write `docs/frontend-architecture.md`, the project facts every skill reads            |
| `fe`                 | you        | Router: which skill for which goal                                                    |

Design rules: the model is defined once (`fe-architecture`); workflow skills carry only an order of work with a completion criterion per step; project facts live in the target repo's profile, never in the skills.

## Install

```bash
scripts/install.sh                          # copies into ~/.claude/skills
scripts/install.sh /path/to/repo/.agents/skills   # or a project skills directory
```

It also loads as a Claude Code plugin (`.claude-plugin/plugin.json`, skills under `skills/`). Then, in a project: `/fe-init-profile`, then `/fe-check-structure`.

## The scanner

`node skills/fe-architecture/scripts/fe-scan.mjs <sourceRoot>` (no dependencies, Node 20+) reports deep imports into a capability, shared code importing capabilities, file and capability cycles, high fan-out, single-consumer `shared/` files, oversized files, and vague buckets. It resolves relative imports, `tsconfig` `paths` and `extends`. Flags: `--features <dir>`, `--allow-subbarrels`, `--limit N`, `--all`, `--json`, `--fail-on error|warn|never`.

## Verify the package

```bash
npm run check    # validate-package (frontmatter, links, portability, single-source, budgets) + scanner tests
```

Behavioral evals and their honest limits: [evals/RESULTS.md](evals/RESULTS.md). A filled sample profile: [sample](skills/fe-architecture/assets/profile.sample.md).

## Layout

```text
skills/<name>/SKILL.md        the skills (fe-architecture also holds references/, assets/, scripts/)
scripts/                      install.sh, validate-package.mjs
tests/                        scanner tests (node:test)
evals/                        behavioral cases, fixtures, results
.claude-plugin/plugin.json    plugin manifest
```
