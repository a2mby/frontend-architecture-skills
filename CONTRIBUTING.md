# Contributing

## Setup

Node 22 or newer, git. No install step: `npm run check` runs the package validator and all tests with the built-in test runner.

```bash
npm run check      # validate-package + node --test
npm run validate   # package checks only
npm test           # tests only
```

## Ground rules

- **One source of truth.** The model (ladder, levels, state rules, trust and scan-evidence rules) lives only in `skills/fe-architecture/SKILL.md`. Workflow skills hold an order of work with a `Done when` per step and point at the core. The validator fails if a core phrase is restated elsewhere.
- **Refer to skills by name**, never by slash command: slash syntax is Claude Code specific and namespaced under a plugin install.
- **Budgets:** `description` at most 420 characters and `SKILL.md` at most 200 lines (stricter than the spec on purpose: descriptions load every turn).
- **A new reference** needs the `Why it exists / Use when / Do not use when` header, a link from the core index, and evidence that it changes agent behavior (an eval case). Prefer replacing text over adding.
- **A scanner change** needs a test that fails without it, in `tests/`. Fixtures that need parent configs go under `tests/fixtures/` and are copied to a temp dir by the test.
- **No new runtime dependencies** without a demonstrated need.

## Evals

Deterministic tests run in `npm test`. Agent-driven evals need a local agent CLI and cost money: see [evals/README.md](evals/README.md). Do not edit `evals/RESULTS.md` by hand; it is written by the runner. Report only runs that executed.

## Versioning

Semantic versioning, applied to the behavior contract rather than the code:

- **Major:** renaming or removing a skill, changing a skill's arguments, removing a scanner flag, or changing an exit code or an existing JSON field.
- **Minor:** new skills, references, scanner rules or flags, new JSON fields.
- **Patch:** fixes and wording that do not change behavior.

Update `.claude-plugin/plugin.json` and `package.json` together (the validator checks they match) and add a `CHANGELOG.md` entry. Tags are `vX.Y.Z`.

## Releases and publishing

`package.json` stays `private`: this repository is distributed as a Claude Code plugin and by copying skills, not as an npm package. Only a maintainer tags a release; pushing, tagging, and listing in any marketplace are manual, deliberate steps. CI never publishes.

## Pull requests

Small, focused, with the `npm run check` result. Use the PR template. Security issues go through [SECURITY.md](SECURITY.md), not a public PR.
