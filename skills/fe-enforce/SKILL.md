---
name: fe-enforce
description: Add or tighten machine-enforced frontend boundaries (import rules, cycle checks, CI) and prove they fail on violations. Takes an optional capability or rule as its argument.
disable-model-invocation: true
---

Turn the boundaries in the target (the user's argument, `$ARGUMENTS`; default: all capabilities) into checks. Load the `fe-architecture` skill, then [enforcement](../fe-architecture/references/enforcement.md) and [configs](../fe-architecture/references/enforcement-configs.md).

## Steps

1. **Discover** what already enforces: lint config, `dependency-cruiser`, `eslint-plugin-boundaries`, Nx tags, `knip`, CI. Done when each existing rule is listed with its file, and each is extended rather than replaced (ESLint replaces a rule's options instead of merging them).
2. **Choose the smallest tool** that closes the gap: the project's existing linter for import-string rules, a resolved-path tool for relative imports and cycles, the scanner as the zero-install fallback, copied into the project (for example `scripts/fe-scan.mjs`) so CI can reach it. A new dependency needs the owner's approval.
3. **Write rules from the Module Map or capability list:** other code imports a capability through its public entry only; shared never imports capabilities; named module directions hold inside Complex capabilities. Set the scanner's `entryPolicy` to the repo's convention. Done when each rule is generated per capability, so a new capability cannot go unprotected.
4. **Run a negative test.** Add a throwaway forbidden import (deep, relative, aliased, and re-exported), confirm the check fails on each, remove the file, and confirm the check passes on the real code. Done when every forbidden form was shown failing, with the command output kept. If the scan is partial, the negative test proves nothing about the unresolved area: say so.
5. **Wire into CI or a package script** so the check runs on every change, with `--strict-coverage` when the scan is complete. Done when a CI file or script, pointing at a path inside the repository, runs the check; a rule nobody runs is documentation.
6. **Update the profile's** `Enforced boundaries` section.

Existing violations: write a baseline (`--write-baseline`) so CI fails only on new ones, record a reason for each exception (and an expiry where the owner wants one), and let the owner choose between fixing now and keeping the baseline. A baseline lists debt; it does not clear it.
