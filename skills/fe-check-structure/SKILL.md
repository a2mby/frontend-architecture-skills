---
name: fe-check-structure
description: Audit a frontend's structure against the architecture model. Read-only report. Usage - /fe-check-structure [sourceRoot]
disable-model-invocation: true
---

Audit the target (`$ARGUMENTS`; default: the profile's `sourceRoot`). Report only; modify no files. Load the `fe-architecture` skill for the rules.

## Steps

1. **Locate.** Read the profile, `AGENTS.md`, and decision register. Done when sourceRoot, framework, and capabilities directory are each confirmed or marked `assumed`.
2. **Scan.** Run the scanner with `--fail-on never`. Re-run with `--all` for any rule you will cite in the report, and with `--allow-subbarrels` when the profile documents per-folder barrels. Done when the scan output is in hand with its counts.
3. **Confirm.** Open at least one offending file per finding group and trace the real import before accepting it ([anti-patterns](../fe-architecture/references/anti-patterns.md): symptom is a hypothesis). Done when each reported item is confirmed, or dropped as a false positive with a reason.
4. **Check the manual items** the scanner cannot see:
   - Public entries mixing client and server exports
   - State copied between server data, store, and URL
   - Domain rules duplicated in two places
   - Edge notes missing for network reads and mutations (loading, empty, error, retry)
   - Components importing 3+ capabilities
   - Existing enforcement: which of the findings a lint rule or CI step already blocks
5. **Rank** by blast radius: cycles and cross-capability deep imports first, then ownership debt, then size and naming.

## Report

```md
## Structure check: <app>

Capabilities: <name: level (evidence)> for each capability that has a finding; levels are per capability, never per app
Scan: <errors>/<warnings>/<info>, unresolved imports: <n>

Pass:
- ...

Fail (ranked):
1. <finding> | evidence: <file:line or import> | smallest repair: <repair> | cost / not-when: <...>

Not checked: <items the scan or review could not cover>
Next: /fe-restructure <target> | /fe-enforce | /fe-decide <topic> | /fe-init-profile
```

Leave Fail items unfixed unless the request also said to fix them.
