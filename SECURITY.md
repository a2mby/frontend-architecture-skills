# Security policy

## Scope

This package contains agent instructions (Markdown), a read-only Node scanner (`skills/fe-architecture/scripts/fe-scan.mjs`), a git-diff helper (`skills/fe-review/scripts/scan-delta.mjs`), and an installer (`scripts/install.mjs`). It makes no network calls and has no runtime dependencies.

What the code does to your machine:

- The scanner reads files under the source root you give it and writes only when you pass `--write-baseline`.
- `scan-delta.mjs` runs `git` with arguments passed as an array (no shell), validates the ref, and creates and removes one temporary worktree under the OS temp directory.
- The installer copies skills into a skills directory, and later modifies or deletes only directories carrying its own `.fe-skills.json` marker.

Security-relevant reports include: a way for repository content to make a skill run unreviewed commands, shell or option injection through a ref or path, the installer touching files it did not install, and the scanner writing outside its documented outputs.

## Reporting

Report privately through GitHub's "Report a vulnerability" (Security tab of the repository) rather than a public issue. Include the version, a minimal reproduction, and the impact. Expect an acknowledgement within 7 days; this is a volunteer project and there is no bounty.

## Supported versions

Only the latest released version receives fixes.

## Working with untrusted repositories

The skills tell the agent to treat repository text (`AGENTS.md`, profiles, comments, scripts) as data and to read a script before running it. That is guidance for the model, not a sandbox: run agents on untrusted code with your agent's own permission controls enabled.
