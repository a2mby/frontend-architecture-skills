# Behavioral eval results

Two sections: the automated run (machine-checked, the current record) and the original author-graded run (history, kept unchanged below).

## Automated run: 2026-11-14

Runner: `node evals/run-agent-evals.mjs` (see [README](README.md)). Agent: Claude Code 2.1.323, model alias `sonnet` (resolved by the CLI; stream shows `claude-sonnet-5-5`). 13 cases, 15 trials, total cost about $3. Raw record: [results/2026-11-14T09-30-53-999Z.json](results/2026-11-14T09-30-53-999Z.json) (per-check outcome, changed files, final text of every trial).

| Case | Skill | Scenario | Trials | Trials with all checks passing | Checks passed |
| --- | --- | --- | --- | --- | --- |
| classify-tie-break | fe-architecture | existing | 1 | 1/1 | 5/5 |
| check-structure-seeded | fe-check-structure | legacy | 1 | 1/1 | 6/6 |
| vue-portability | fe-architecture | existing | 1 | 1/1 | 4/4 |
| greenfield-new-capability | fe-apply-feature | greenfield | 3 | 3/3 | 15/15 |
| apply-feature-simple | fe-apply-feature | existing | 1 | 1/1 | 6/6 |
| restructure-deep-import | fe-restructure | legacy | 1 | 1/1 | 4/4 |
| enforce-negative-test | fe-enforce | legacy | 1 | 1/1 | 3/3 |
| review-branch-readonly | fe-review | existing | 1 | 1/1 | 5/5 |
| decide-one-way-door | fe-decide | existing | 1 | 1/1 | 4/4 |
| init-profile | fe-init-profile | existing | 1 | 1/1 | 4/4 |
| healthy-no-restructure | fe-restructure | healthy | 1 | 1/1 | 3/3 |
| legacy-partial-coverage | fe-check-structure | legacy | 1 | 1/1 | 3/3 |
| laravel-inertia-placement | fe-architecture | existing | 1 | 1/1 | 3/3 |

What the checks verify (file-tree diffs, scanner re-runs, an injected forbidden import failing the wired CI script, `git status`/branch/worktree/stash unchanged after `fe-review`, no unlabeled non-existent paths in the greenfield answers) and what they do not: [README](README.md#limits).

### Re-runs after the last skill edits

The profile template and `fe-review` text were edited after the main run. `review-branch-readonly` 5/5 and `init-profile` 4/4 ([results/2026-11-14T09-42-56-421Z.json](results/2026-11-14T09-42-56-421Z.json)) and the new `review-hostile-ref` 4/4 ([results/2026-11-14T09-44-05-909Z.json](results/2026-11-14T09-44-05-909Z.json); an earlier attempt at that case failed only because its `skill-used` check could not see a skill that refused before loading the core skill, so the check was replaced). All other cases were last run before those edits; they do not use the edited text.

### What the earlier runs showed (kept in `results/`, not discarded)

- `...22-12-36...-prompt-by-name.json`: with prompts that only *named* a workflow skill, Claude Code refused to load it (the agent replied that the user must type the slash command), because workflow skills are `disable-model-invocation`. 8 of 13 cases failed for that reason. This is behavior, not a defect, and is now documented (README, compatibility matrix); the eval prompts use the slash form a user would type.
- `...22-19-01...-aborted-usage-limit.json`: invalid. A 5-hour usage limit ended most trials at 0 cost.
- `...09-22-47...-superseded-detection.json`: the substantive checks passed except one; its `skill-used` check could not see slash-invoked skills. In that run `apply-feature-simple` created `src/features/newsletter/` for a one-file change, which the check rejects; in the final run the same case passed. That is one observed variance between two single trials: Simple work is not reliably kept flat when the repo already has a `features/` folder.

### Limits (read before relying on this)

- Single trials (greenfield: 3), one model, one agent CLI. A pass shows the behavior occurred once, not how often. No variance is measured.
- Slash-invoked skills are not echoed in the stream; `skill-used` is inferred from the skill being registered and the core skill then being loaded.
- Output checks are pattern heuristics; the stored final texts should be read, not just the counts.
- The host was not isolated: user-level settings, `CLAUDE.md`, and plugins loaded. No `fe-*` skill existed outside the temp project.
- Not run: any agent other than Claude Code; Next.js, Svelte, Angular framework references; `fe-restructure` on a Complex capability; `fe-decide` with a recorded decision register.

## Original run: 2026-11-13 (author-graded, history)

One fresh `sonnet` subagent per case, given only the skills directory and a fixture (no expected answers). Assertions are in [`evals.json`](evals.json). Graded from the transcript by the package author.

| Case                  | Assertions passed | Notes                                                                                                                  |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| classify-tie-break    | 5/5               | Moderate with a written tripwire, one draft owner, no Module Map. Added extra edge/tradeoff notes beyond the short form. |
| check-structure-seeded | 7/7              | Ran `fe-scan`, found cycle, deep import, shared-to-capability; did not invent fan-out; modified no files.                |
| vue-portability       | 5/5               | Vue idioms only; URL owns committed filters; draft in the filter component; Pinia explicitly rejected.                  |

Grading nuance missed on first pass: the classify agent called "3 workflows" a *firm* signal, and the audit agent labeled a whole app "Moderate (arguable)". Both reached the right answer, but the vocabulary leaked. `fe-architecture` now says firm/arguable apply only to Complex-row signals and that levels belong to a capability, never an app.

Defects found by review after the run and fixed: the scanner CLI exited silently (status 0, no output) when its path contained a space or was symlinked, now covered by CLI tests; instructions ran the scanner from the skill directory so a relative `sourceRoot` failed, now run from the project root; CI could not reach a script living in the skills directory, so `fe-enforce` copies it into the project; a doc link broke after `install.sh`, so the validator now checks links and the scanner from an installed copy; `fe-review` used `git stash`, now a temporary worktree.

Defect found and fixed after the run: `fe-check-structure` reported a complexity level for the whole app; levels are per capability, and the report template now says so.

## Limits (read before relying on this)

- One trial per case, one model, three cases. This shows the skills steer an agent correctly on the covered paths; it does not measure variance.
- Not yet exercised by trial: `fe-apply-feature` implementation runs, `fe-restructure`, `fe-enforce`, `fe-review`, `fe-decide`, `fe-init-profile`, and the Next.js, Svelte, and Angular references.
- The scanner was validated on fixtures and two real codebases; it reads imports with a regex and does not see dynamic computed imports, template-only references (Angular), or Nuxt auto-imports.
