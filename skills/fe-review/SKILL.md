---
name: fe-review
description: Review a frontend diff or PR for ownership, boundary, state, and contract problems. Read-only. Takes an optional base ref as its argument.
disable-model-invocation: true
---

Review the change against the base ref the user names (`$ARGUMENTS`; default: the repository's default branch merge base). Report only; leave the worktree untouched. Load the `fe-architecture` skill for the rules, including its Evidence and trust rules.

## Steps

1. **Scope and scan delta.** Run the helper from the project root with the profile's source root:

   `node <this skill's directory>/scripts/scan-delta.mjs '<base-ref>' --root <sourceRoot>`

   The ref is user text reaching a shell, so quote it with single quotes exactly as shown. If it contains a single quote, a newline, or starts with `-`, do not run anything: say the ref is unsafe and ask for another. The helper then validates the ref itself, scans the head in place and the merge base in a temporary git worktree it removes afterwards, and prints changed files plus new, resolved, and unchanged findings. Done when every changed file maps to a capability or to app composition, each new finding is listed, each removed one is credited, and both scans' coverage is stated (the base worktree has no `node_modules` or generated files, so its coverage can be lower).
2. **Walk the checklist** for each changed capability:
   - New state has one named owner; drafts reset and commit explicitly
   - New import edges point in an allowed direction, through public entries
   - Nothing moved to `shared/` without a second real consumer
   - New network edge carries an edge note: owner, invalidation, failure, duplicate-write guard
   - Contracts are validated at the boundary and errors normalized once
   - Server-only code stays unreachable from client entries
   - Accessibility, i18n, and error-boundary rows of [system design](../fe-architecture/references/system-design.md) hold for new UI
   - Tests exercise the changed boundary, not implementation details
3. **Verify claims.** Open the file behind every finding before reporting it; drop what the code contradicts. Done when each finding names file:line and the observed import or state.

## Report

Findings ranked by severity: `blocking` (breaks a boundary, duplicates an authority, adds a cycle), `should-fix`, `nit`. Each lists evidence, why it matters, and the smallest repair. End with what was checked and what was not (partial coverage, scanner NOT CHECKED items). Leave the code unchanged.
