---
name: fe-review
description: Review a frontend diff or PR for ownership, boundary, state, and contract problems. Usage - /fe-review [base-ref or PR]
disable-model-invocation: true
---

Review the change (`$ARGUMENTS`; default: the working tree against the merge base). Report only. Load the `fe-architecture` skill for the rules.

## Steps

1. **Scope.** List changed files with `git diff --name-only <base>...HEAD`; read the profile. Done when every changed file maps to a capability or to app composition.
2. **Scan delta.** Run the scanner on the head, then on the base inside a temporary `git worktree add <tmp-dir> <base>` (remove it afterwards); the working tree stays untouched. Diff the findings. Done when each new finding is listed and each removed finding is credited.
3. **Walk the checklist** for each changed capability:
   - New state has one named owner; drafts reset and commit explicitly
   - New import edges point in an allowed direction, through public entries
   - Nothing moved to `shared/` without a second real consumer
   - New network edge carries an edge note: owner, invalidation, failure, duplicate-write guard
   - Contracts are validated at the boundary and errors normalized once
   - Server-only code stays unreachable from client entries
   - Accessibility, i18n, and error-boundary rows of [system design](../fe-architecture/references/system-design.md) hold for new UI
   - Tests exercise the changed boundary, not implementation details
4. **Verify claims.** Open the file behind every finding before reporting it; drop what the code contradicts. Done when each finding names file:line and the observed import or state.

## Report

Findings ranked by severity: `blocking` (breaks a boundary, duplicates an authority, adds a cycle), `should-fix`, `nit`. Each lists evidence, why it matters, and the smallest repair. End with what was checked and what was not. Leave the code unchanged.
