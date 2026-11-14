# Behavioral eval results

Run: 2026-11-13, one fresh `sonnet` subagent per case, given only the skills directory and a fixture (no expected answers). Assertions are in [`evals.json`](evals.json). Graded from the transcript by the package author.

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
