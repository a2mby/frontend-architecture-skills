# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: see [CONTRIBUTING](CONTRIBUTING.md#versioning).

## [0.2.0] - unreleased

### Breaking
- The `fe` router skill is removed; its table is in the README. If you installed 0.1.0 with `install.sh`, delete the old `fe` directory yourself (it has no version marker) and run `node scripts/install.mjs --update --adopt-legacy`.
- Workflow skills no longer mention slash commands (`/fe-review`); they refer to skills by name. In Claude Code the slash form still works (`/fe-review`, or `/fe-arch:fe-review` when installed as a plugin).
- The plugin is named `fe-arch` (was `frontend-architecture-skills`), so plugin commands are `/fe-arch:<skill>`.
- Scanner: default output now ends with a `NOT CHECKED` list and a coverage verdict; a scan with unresolved project imports reports `INCOMPLETE`, not a pass. JSON output gained `status`, `coverage`, `limitations`, `entryPolicy`, `suppressed`; old fields are unchanged. Exit codes 0/1/2 are unchanged; 3 is new (`--min-coverage`).

### Added
- Scanner: lexer-based import extraction (comments, strings, template and regex literals ignored; `<script>` only for Vue and Svelte); discovery of `tsconfig*.json`, `jsconfig.json`, `extends` and project `references`; classification of every import; coverage summary, `--min-coverage`, `--strict-coverage`; `fe-scan.config.json` (`features`, `ignore`, `entryPolicy`, `publicEntries`, `aliases`, `rules`, `exceptions`); `--baseline` / `--write-baseline` with count-aware entries, reasons, expiry, and stale detection; entry-policy detection; `escapes-root` warning; framework "not checked" notes (Nuxt, Angular, Laravel, workspaces, `import.meta.glob`).
- `fe-review`: `scripts/scan-delta.mjs` compares findings against the merge base in a temporary worktree, with validated refs and no shell.
- Core skill: Locate modes (existing capability, new capability, new app), "Starting empty", "Evidence and trust", "Workflow weight"; workflows are level-conditional.
- Laravel + Inertia reference; "Alternatives" for layered, FSD, and domain layouts; monorepo boundary guidance.
- Node installer `scripts/install.mjs` (install, `--update`, `--uninstall`, `--list`, `--dry-run`), Codex `agents/openai.yaml` per workflow skill, `marketplace.json`, MIT `LICENSE`, CI, contribution and security docs, eval harness and real-world validation record.

### Changed
- Spec-based skill validation with a real frontmatter reader (`scripts/validate-package.mjs`).
