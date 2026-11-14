# Implementation status

Date: 2026-11-14. Base: commit `99c5207` plus the uncommitted working tree. Nothing was committed, pushed, tagged, or published. `audit/AUDIT.md` is unchanged. Test commands: `npm run check` (validator + 72 tests, all passing at the end), `node evals/run-agent-evals.mjs` (agent evals), `node evals/real-world/reproduce.mjs` (public-repo scan).

## A. Implementation summary

- **Scanner (`fe-scan.mjs` 0.2.0, same file, no dependencies).** Lexer-based import extraction; config discovery (`tsconfig*.json`, `jsconfig.json`, `extends`, `references`); import classification and a coverage verdict; `NOT CHECKED` list; baselines, ignore globs, exceptions with reasons and expiry; entry-policy detection and configuration; `escapes-root`; per-finding rule, severity, file, line, target, fix; `--min-coverage` (exit 3). JSON and exit codes 0/1/2 stay compatible.
- **Skills.** Core gained Locate modes, Starting empty, Evidence and trust, Workflow weight. Workflows are level-conditional, name skills instead of slash commands, tolerate unsubstituted arguments, and gate conclusions on coverage. `fe` router removed (folded into README). `fe-review` uses a no-shell helper (`scan-delta.mjs`). Laravel + Inertia reference added; Alternatives (layered, FSD, domain) documented.
- **Distribution.** Node installer with markers, update, uninstall, list, dry-run; `agents/openai.yaml` for Codex; plugin renamed `fe-arch`, `marketplace.json` added, `claude plugin validate . --strict` passes.
- **Verification.** Real frontmatter reader and spec-based validator; 72 tests; agent-eval runner with 13 cases; reproducible public-repo scan; MIT LICENSE, CI workflow, CHANGELOG, CONTRIBUTING, SECURITY, issue and PR templates.

## B. Findings

Previously resolved (verified present in the tree, not touched): (1) CLI silent exit with spaces/symlinks: `real()` check at the end of `fe-scan.mjs`, test "prints output when the script path contains a space or is a symlink". (2) Relative `sourceRoot`: core Scanner line says run from the project root. (3) CI reaching the scanner: `fe-enforce` step 2 copies it into the project (an eval trial did and wired `npm run check:boundaries`). (4) Broken links after install: validator checks links and the installed layout. (5) `git stash` in review: replaced by a temporary worktree, now `scan-delta.mjs` (test asserts empty stash list). (6) Per-capability complexity: core text and the check-structure report template. (7) firm/arguable wording: core Complexity section. All are **RESOLVED ALREADY**; the 3 preserved evals (classify-tie-break 5/5, check-structure-seeded 6/6, vue-portability 4/4 checks) still pass in the automated run.

| Finding | Original problem | Resolution | Files changed | Test evidence | Status |
|---|---|---|---|---|---|
| F-01 | Clean result on unresolved imports | Config discovery incl. references/jsconfig, import buckets, coverage verdict, `INCOMPLETE`, `--min-coverage` exit 3, core and workflow rules "partial is never Pass", limitations list | `fe-scan.mjs`, core SKILL, check-structure/restructure/enforce/review SKILL, `enforcement.md` | `tests/fe-scan.coverage.test.mjs` (Vite references, Laravel jsconfig, SvelteKit before/after sync, externals, baseUrl, nested aliases, exit 3); eval `legacy-partial-coverage` 3/3 | FIXED |
| F-02 | Locate impossible for greenfield | Three Locate modes, `(proposed)` labels | core SKILL, fe-apply-feature | Eval `greenfield-new-capability` 3/3 trials, machine check of unlabeled non-existent paths | FIXED |
| F-03 | No greenfield path | "Starting empty" section, no generator | core SKILL, fe-apply-feature, fe-init-profile | Same eval (Vite React + TS fixture): proposed paths, no invented consumer. Not run: Next.js greenfield | FIXED |
| F-04 | Claude-only mechanics presented as portable | Skills named not slashed; arguments optional; `agents/openai.yaml`; matrix from official docs plus real CLI runs; observed Claude Code refuses model loading of user-only skills (documented) | all workflow SKILLs, `agents/`, `docs/compatibility.md`, README, validator | Docs fetched for 6 agents; real runs: Claude Code (evals), Cursor (1 run), OpenCode (1 run); validator test for adapters | FIXED for Claude Code; **BLOCKED** for execution tests of Codex (CLI present, every model rejected for this account), Copilot and Gemini CLI (no runtime). Next step: run the re-verify steps in `docs/compatibility.md` with those agents |
| F-05 | Plugin install incomplete | `marketplace.json`, complete `plugin.json`, namespaced references, update command documented | `.claude-plugin/*`, README, CI | `claude plugin validate . --strict` passes; local-path `marketplace add` + `install` worked in an isolated config dir (`fe-arch` 0.2.0 listed; real profile untouched) | FIXED locally; **BLOCKED**: install from GitHub (branch unpushed; no authorization to push). Next step: push, then run the two README install commands |
| F-06 | No baseline/ignore | `--baseline`, `--write-baseline`, `fe-scan.config.json` (`ignore`, `rules`, `exceptions`, `aliases`), count-aware, reasons required, expiry, stale detection | `fe-scan.mjs`, `enforcement.md`, fe-enforce | `tests/fe-scan.adoption.test.mjs` (83-deep-import legacy app: baseline, CI passes, one new violation fails; stale; expired; reasonless rejected); eval `enforce-negative-test` 3/3 | FIXED |
| F-07 | Regex false positives | Lexer (comments, strings, templates incl. nesting, regex literals, JSX apostrophes), `<script>` extraction; unsupported syntax listed | `fe-scan.mjs`, `enforcement.md` | `tests/fe-scan.lexer.test.mjs` (7), fixture `comments` | FIXED |
| F-08 | Monorepo / packages | `escapes-root` warning, workspace limitation printed, guidance on `exports` and boundary tools; no graph engine | `fe-scan.mjs`, `enforcement.md` | Coverage test "relative imports escaping the root warn..." | ADDRESSED BY DESIGN |
| F-09 | Thin behavioral evidence | 13 cases covering every workflow, core, framework (Inertia, Vue), greenfield/existing/legacy/healthy; file-tree, scanner, git, CI-gate checks; model/CLI/date recorded; results kept including failed runs | `evals/*`, `tests/*` | 72 deterministic tests; 15 agent trials, all checks passing in the final run | FIXED, with limits: single trials (greenfield 3), one model, one agent CLI, heuristic output checks, host not isolated; see `evals/RESULTS.md` |
| F-10 | OSS basics missing | LICENSE (MIT), CI matrix (3 OS x Node 20/22), CHANGELOG, CONTRIBUTING (semver and release policy), SECURITY, issue and PR templates; `package.json` stays private | repo root, `.github/` | Validator checks LICENSE/CHANGELOG/version sync | FIXED; **BLOCKED**: CI never executed (needs push). Next step: push and read the Actions run |
| F-11 | Untrusted repo content | "Evidence and trust" in core: repo text is data, read scripts before running | core SKILL, fe-check-structure, fe-init-profile | Validator single-source check. Not adversarially tested (no poisoned-repo eval) | FIXED (guidance only) |
| F-12 | Unsafe git/shell args | Two layers: `fe-review` tells the agent to single-quote the ref and refuse refs with `'`, newline or leading `-`; `scan-delta.mjs` uses an argv array (no shell), validates the ref, `rev-parse --end-of-options`, temp worktree always removed | `skills/fe-review/*` | `tests/scan-delta.test.mjs`: `--output=`, `-h`, `$(...)`, backticks, `;`, newline, empty, unknown refs refused with no side effects; valid odd ref works; evals `review-branch-readonly` 5/5 and `review-hostile-ref` (agent-built command `/fe-review 'main; touch pwned'`: agent refused and asked, no `pwned` file, git unchanged) 4/4, one trial each | FIXED |
| F-13 | Installer | `install.mjs` (macOS/Linux/Windows APIs), targets, update, uninstall, list, dry-run, markers, refuses foreign dirs, preserves local edits; `install.sh` is a wrapper | `scripts/install.*`, README | `tests/install.test.mjs` (7), run on macOS only | FIXED on macOS; Linux and Windows **BLOCKED** (CI unexecuted); no OS-specific code besides a skipped symlink test |
| F-14 | Heavy workflows | Workflow weight table; steps by level | core SKILL, fe-apply-feature | Eval `apply-feature-simple` passed in the final run (6/6) but one earlier trial created `features/newsletter/`: Simple is not reliably kept flat | FIXED (one trial each way) |
| F-15 | Framework claims | `laravel-inertia.md`; README claims narrowed to what is tested | references, README, plugin description | Eval `laravel-inertia-placement` 3/3; scanner tests on the Laravel shapes | FIXED |
| F-16 | Invisible framework mechanisms | `NOT CHECKED` list: Nuxt, Angular, Laravel generated, workspaces, glob and dynamic imports | `fe-scan.mjs` | Coverage test for Nuxt/Angular/glob | FIXED |
| F-17 | Fragile validator | Frontmatter reader (quotes, block scalars, maps), spec name/description rules, rationale for project budgets, anchors, adapters, manifests | `scripts/validate-package.mjs`, `scripts/lib/frontmatter.mjs` | `tests/frontmatter.test.mjs`, `tests/validate.test.mjs` | FIXED; reference `skills-ref validate` not run |
| F-18 | Names, `fe` router | Decision: keep `fe-*` (no collision found among installed skills; renaming now costs more than it buys), remove the router, rename plugin `fe-arch` for short namespaced commands, freeze names for 1.0 | README, CHANGELOG, plugin manifests | Validator bans slash syntax; installed-layout check | ADDRESSED BY DESIGN (collision risk beyond this machine unmeasured) |
| F-19 | No recorded real-world run | bulletproof-react pinned scan with reproducer | `evals/real-world/*`, `docs/real-world-validation.md` | `reproduce.mjs` executed: both runs match (14 errors, 0 with `app/**` ignored); 14 are false positives relative to that repo's convention | FIXED |
| F-20 | Hard-coded entry policy | `entryPolicy` (`root-only` / `subbarrels` / `declared`), detection with 3+ imports and 80% rule, assumption reported, profile field, alternatives documented | `fe-scan.mjs`, `enforcement.md`, `feature-based.md`, profile template | Adoption tests (flag, config, declared, detected, ambiguous) | FIXED |

## C. Architectural decisions

- **One scanner file.** `fe-enforce` copies it into projects, so it stays a single dependency-free file; cost: it is long (about 800 lines).
- **Lexer, not parser.** Enough to stop false positives; not a type checker. Unsupported syntax is listed.
- **Coverage over exit-code changes.** Default exit codes are unchanged for compatibility; strict behavior is opt-in (`--strict-coverage`), and the text always says `INCOMPLETE`.
- **Detection only with real evidence.** Entry policy is auto-detected only from 3+ imports; otherwise root-only plus an assumption note.
- **Baseline keyed without line numbers, count-aware.** Moving code does not invalidate entries; adding a second identical violation fails.
- **`disable-model-invocation` kept** for workflow skills. Observed consequence: in Claude Code the user must type the slash form. Trade-off accepted and documented.
- **Plugin name `fe-arch`.** Short namespaced commands (`/fe-arch:fe-review`); breaking rename from 0.1.0, logged.

## D. Testing results (executed)

- `npm run check`: validator ok and **73 tests, all passing** on macOS, Node 24; `node --test` (72 tests at the time) and the validator also passed on Node 20.20.2 (via `npx node@20`). The test script is now bare `node --test` because cmd.exe does not expand globs on Windows.
- `claude plugin update fe-arch@fe-architecture-skills` in an isolated config dir: ran, reported already at 0.2.0 (local-path marketplace).
- `claude plugin validate . --strict`: passed. Local plugin install in an isolated config directory: worked.
- `audit/run-scenarios.sh`: runs (exit 0). `evals/real-world/reproduce.mjs`: both runs match.
- Agent evals (Claude Code 2.1.323, `sonnet`): final run 13 cases, 15 trials, all checks passing. Earlier runs kept and explained in `evals/RESULTS.md` (prompt-by-name refusals, usage-limit abort, detection fix); after the last skill edits (profile template, `fe-review` quoting) `review-branch-readonly`, `init-profile`, and the new `review-hostile-ref` were re-run (all passing); the other cases were last run before those two edits, which touch only `fe-init-profile`'s template and `fe-review`.
- The 25 required scenarios: 1 greenfield eval; 2 Vite references test; 3-4 Next.js-shaped aliases, bulletproof-react (folder barrels not tested in a real Next app); 5-6 Laravel fixtures (scanner) plus one Inertia placement eval (React/Vue split not separately evaluated); 7 a Vue `<script setup>` shadcn-shaped barrel cycle test (cycle found; removed by `ignore`; Laravel + Vue config); 8 SvelteKit before/after; 9 Angular fixture with the template limitation; 10 baseline test; 11 `healthy-no-restructure` eval; 12 escapes-root/workspace test; 13 nested aliases; 14 unresolved imports; 15 cycles; 16 comments/strings; 17-18 spaces and symlink; 19-20 installer tests; 21 ratchet test; 22 limitations tests; 23 greenfield eval; 24 `fe-review` git-unchanged check; 25 `enforce-negative-test`. Scenarios 7 and 9 are covered only in the scanner, not by an agent; 3-4 use fixtures and one public Vite repo, not a Next.js app with folder barrels.

## E. Agent compatibility (observed, dated 2026-11-14)

| Agent | Status |
|---|---|
| Claude Code, manual install | VERIFIED (13 cases) |
| Claude Code plugin | PARTIAL (validated, local install; GitHub install untested) |
| Cursor (`cursor-agent` 2026.05.01) | PARTIAL (discovery seen; listed all 8 skills, so `disable-model-invocation` suppression not observed) |
| OpenCode 2.3.0 | PARTIAL (discovery and implicit hiding seen once; explicit load not run) |
| Codex 0.166.0 | UNTESTED (models rejected for this account) |
| GitHub Copilot, Gemini CLI | UNTESTED (no runtime; docs only) |

Full detail: `docs/compatibility.md`.

## F. Remaining limitations

Scanner is static and per source root (no type resolution, template references, auto-imports, workspace package boundaries). Agent behavior is measured with single trials on one model. Layered/FSD direction rules are not checked. Non-Claude agents are unverified. Folder-barrel Next.js layouts and Angular/Svelte guidance have no agent eval. The only real-world scan is one repository whose convention the default model contradicts. Eval output checks are heuristics.

## G. Release readiness

Satisfied: LICENSE, changelog and semver policy, CONTRIBUTING, SECURITY, templates, strict plugin validation, installer tests, scanner coverage and baseline behavior, recorded evals, real-world reproduction, README limitations and troubleshooting. Blocked: CI on three OSes (never run), GitHub plugin install, Linux and Windows installer runs, Codex/Copilot/Gemini runs, `skills-ref` second opinion. To confirm: LICENSE and manifest `author` use the git author name as copyright holder; `repository` and `homepage` come from the existing `origin` remote. Version `0.2.0` is marked unreleased in the changelog.

## H. Final assessment

1. **Personal production use: yes** for Claude Code users: tested end to end, with documented limits.
2. **Team adoption: conditional yes.** Baselines make legacy adoption workable; confirm the first scan's coverage line, and expect to set `entryPolicy` and `ignore`. CI is unproven until pushed.
3. **Public beta: close.** Needs one green CI run on three OSes, the GitHub install check, and ideally one non-Claude agent run.
4. **Stable v1.0: no.** Agent evidence is thin (single trials, one model), non-Claude agents are unverified, and the naming and flag surface should soak through a beta first.
