---
name: fe-restructure
description: Move frontend boundaries safely - split a module, break a cycle, remove deep imports, relocate shared code. Takes the smell or target as its argument.
disable-model-invocation: true
---

Repair the named structural problem (the user's argument, `$ARGUMENTS`; if empty, ask which smell or target) with behavior-preserving steps. Load the `fe-architecture` skill, then [refactoring](../fe-architecture/references/refactoring.md) and [anti-patterns](../fe-architecture/references/anti-patterns.md).

## Steps

1. **Baseline.** Run the profile's checks and the scanner before touching code. Done when each result is recorded as run, failed, or unavailable (and the scan as complete or partial), so pre-existing failures stay distinguishable from regressions.
2. **Diagnose.** Name the specific smell with the offending import, state, or consumer as evidence. Done when the smell cites a file and edge; no smell, no refactor. A healthy structure that merely differs from the default is not a smell.
3. **Target ownership.** Write one paragraph: who owns the responsibility, who consumes it, which public entry crosses the boundary, which edge disappears. Add the tradeoff note. Complex scope also gets a Module Map. Done when the paragraph names the edge that disappears.
4. **Plan the moves** as small batches, each leaving the app buildable. Confirm the plan with the user when it touches more than one capability or moves more than ~15 files.
5. **Move batch by batch.** After each batch: rewrite imports through the public entry, delete dead barrels once all consumers are checked, run typecheck. Done per batch when typecheck is green and the scan error count has not risen.
6. **Add the regression rule** through the `fe-enforce` skill, or recommend the exact rule and report it as not installed.
7. **Prove it.** Re-run the baseline checks and the scanner. Done when the targeted edge is gone from the scan, allowed imports still pass, and a deliberate forbidden import fails. A partial scan cannot prove an edge is gone from its unresolved area.
8. **Record** a five-line decision note when a new pattern was introduced ([refactoring](../fe-architecture/references/refactoring.md)); skip it when following an established pattern.

## Guards

- A refactor and a feature change never share a step.
- Debt discovered on the way goes under Risks / follow-ups.
- Route paths, public URLs, and published package entries keep their behavior unless the request says otherwise.
