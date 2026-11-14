---
name: fe-decide
description: Decide a costly frontend choice (framework, rendering mode, state or data library, auth model, API contract, package split) and write the decision record. Usage - /fe-decide <decision>
disable-model-invocation: true
---

Run the one-way-door procedure for the decision (`$ARGUMENTS`). Load the `fe-architecture` skill, then [decisions](../fe-architecture/references/decision-making.md). For Next.js versus SPA or rendering mode, also read [minimal surface](../fe-architecture/references/nextjs-minimal-surface.md); for a network or non-functional choice, [system design](../fe-architecture/references/system-design.md).

## Steps

1. **Classify reversibility.** Two-way door: decide inline in two lines and stop. One-way door: continue. Done when the verdict cites migration cost, not the word "architecture".
2. **State problem and constraints** (team size, deadline, SEO, offline, traffic, security) in two lines, marking each `known` or `assumed`. Done when no decision drives an unstated assumption.
3. **List 2-3 real options**, including keep-current or defer-with-trigger.
4. **Score** on the rubric (fit, cost, reversibility, coupling, failure mode, team fit) with one evidence line per cell. Hard requirements act as gates. Done when every cell has evidence or is labeled `assumption`.
5. **Recommend one option.** Give the failure mode at misuse or 10x scale, a measurable tripwire, which decision flips if an assumption is wrong, and the tradeoff note.
6. **Record.** Write the five-line decision note in the profile's decision register, or include it inline when the session may not change files. Mark it `proposed` until the owner accepts.

Prefer the boring option already in the repo unless it is the root cause. A recommendation does not authorize the migration it describes.
