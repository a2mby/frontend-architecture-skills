# Evals

Two layers, kept apart so nobody mistakes one for the other.

## 1. Deterministic tests (CI-gated)

`npm test` runs scanner, installer, validator, and `scan-delta` tests in `tests/` against fixtures in `tests/fixtures/` and `evals/fixtures/`. No agent, no network, no cost. These prove the tooling; they say nothing about whether an agent follows the skills.

## 2. Agent-driven evals (manual, costs money)

`evals.json` defines 14 cases covering every workflow skill plus the core skill, across greenfield, existing, legacy, and healthy codebases. The runner:

```bash
node evals/run-agent-evals.mjs --list
node evals/run-agent-evals.mjs                    # all cases, default trials (greenfield: 3, others: 1)
node evals/run-agent-evals.mjs --case greenfield-new-capability --trials 5 --model sonnet
```

Per trial it copies the fixture to a fresh temp directory, installs the skills project-locally with the real installer, snapshots the file tree, runs `claude -p`, snapshots again, and verifies the machine-checkable `checks`:

| Check | Meaning |
| ----- | ------- |
| `no-files-changed`, `changes-within`, `no-new-files-matching`, `new-file-count-at-most` | File-tree diff before and after |
| `scan-errors-not-higher`, `scan-rule-max` | Scanner re-run on the result |
| `npm-script-gate` | A wired CI script passes on the real code and fails after a deliberately forbidden import is injected |
| `git-unchanged` | `fe-review` left status, HEAD, branch, worktrees, and stash untouched |
| `no-invented-paths` | Every file path in the answer either exists in the fixture or sits next to "proposed", "new", "create", or "add" (a heuristic, see limits) |
| `skill-used` | The named skill was loaded: by a Skill tool call, or (slash-invoked workflows, which are not echoed in the stream) registered in the session with the core skill loaded afterwards |
| `output-matches`, `file-contains`, `file-exists` | Pattern checks on the answer or result files |

Each run is written to `evals/results/<timestamp>.json` with model, CLI version, date, cost, per-check outcome, changed files, and the final text. [RESULTS.md](RESULTS.md) summarizes what was run.

## Limits

- Output patterns are heuristics: a pass shows the answer contains the expected signal, a fail may be a phrasing difference. Read the stored final text before drawing conclusions.
- `no-invented-paths` cannot know whether the agent *claims* a path exists. It flags non-existent paths with no "proposed/new" wording nearby.
- Few trials: only the greenfield case runs more than once by default. This is a smoke test, not a benchmark, and variance is not measured.
- The runner does not isolate the host: user-level Claude Code settings, `CLAUDE.md`, and plugins still load. It refuses to run if `~/.claude/skills` already holds `fe-*` skills.
- Only the `claude` CLI is driven. Other agents are listed as untested in the README compatibility matrix.
- The original three cases were first graded by the package author from transcripts (kept in RESULTS.md as history); their `checks` are the automated approximation of those assertions.
