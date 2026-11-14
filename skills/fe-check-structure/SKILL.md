---
name: fe-check-structure
description: Audit a frontend's structure against the architecture model and report ranked findings. Read-only. Takes an optional source root as its argument.
disable-model-invocation: true
---

Audit the target (the user's argument, `$ARGUMENTS`; default: the profile's `sourceRoot`). Report only; modify no files. Load the `fe-architecture` skill for the rules, including its Evidence and trust rules.

## Steps

1. **Locate.** Read the profile, `AGENTS.md`, and decision register. Done when sourceRoot, framework, and capabilities directory are each confirmed or marked `assumed`.
2. **Scan.** Run the scanner with `--fail-on never`; re-run with `--all` for any rule you will cite. If the profile documents a public-entry convention or generated code to ignore, pass it (or use `fe-scan.config.json`). Done when the output is in hand and the **coverage** state is written down: complete, or partial with the top unresolved prefixes.
3. **Confirm.** Open at least one offending file per finding group and trace the real import before accepting it ([anti-patterns](../fe-architecture/references/anti-patterns.md): symptom is a hypothesis). Done when each reported item is confirmed, or dropped as a false positive with a reason.
4. **Check the manual items** the scanner cannot see:
   - Public entries mixing client and server exports
   - State copied between server data, store, and URL
   - Domain rules duplicated in two places
   - Edge notes missing for network reads and mutations (loading, empty, error, retry)
   - Components importing 3+ capabilities
   - Existing enforcement: which findings a lint rule or CI step already blocks
5. **Rank** by blast radius: cycles and cross-capability deep imports first, then ownership debt, then size and naming.

A partial scan never yields "Pass": the Pass section then reads "no violations in the checked scope", and the unresolved prefixes go under Not checked.

## Report

```md
## Structure check: <app>

Capabilities: <name: level (evidence)> for each capability that has a finding; levels are per capability, never per app
Scan: <errors>/<warnings>/<info>, baselined: <n>; coverage: <complete | partial: n unresolved, top prefixes>

Pass (within the checked scope):
- ...

Fail (ranked):
1. <finding> | evidence: <file:line or import> | smallest repair: <repair> | cost / not-when: <...>

Not checked: <the scanner's NOT CHECKED list, unresolved prefixes, and manual items you skipped>
Next: `fe-restructure` <target> | `fe-enforce` | `fe-decide` <topic> | `fe-init-profile`
```

Leave Fail items unfixed unless the request also said to fix them.
