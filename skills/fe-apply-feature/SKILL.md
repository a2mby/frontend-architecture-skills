---
name: fe-apply-feature
description: Add or change a frontend feature, or start a new app or capability, with explicit ownership. Takes the feature to build as its argument.
disable-model-invocation: true
---

Implement the requested feature (the user's argument, `$ARGUMENTS`; if it is empty, ask what to build) as the smallest coherent change with named owners. Load the `fe-architecture` skill and follow its rules, including [Starting empty](../fe-architecture/SKILL.md#starting-empty) for new apps; this skill supplies the order of work.

**Steps by level** (level of the capability touched): Simple runs steps 1, 2, 4, 5, 6, 8 (step 3 only if a new network edge appears, step 7 skipped). Moderate and Complex run all eight.

## Steps

1. **Locate.** Run the shared Locate step in the right mode (existing capability, new capability, new app). Done when the mode is stated and every path is either opened or marked `(proposed)`; no existing consumer is invented.
2. **Classify.** Apply the complexity table and tie-break. Done when the level is stated with the evidence for each signal counted.
3. **Specify the contract.** Read the API contract before UI ([API-first](../fe-architecture/references/api-first.md)); load the framework file matching the profile. Write an edge note for every new network edge. Done when each exchanged shape is confirmed in the real contract or labeled `proposed` with a mock plan.
4. **Decide placement.** Walk the Ownership Ladder per new file or shared thing. Complex: write the Module Map before the first file. Done when every new file has an owner and a rung.
5. **Implement** inside the chosen owner. Reuse existing primitives, form stack, and styling system. Interaction, forms, or visuals: read [forms, UI, styling](../fe-architecture/references/forms-ui-styling.md). Done when behavior outside the request is unchanged and each new state has one owner.
6. **Verify.** Run the profile's lint, typecheck, test, and build commands. Moderate and Complex also run the scanner before and after and compare, and add behavioral tests at the changed boundary ([testing](../fe-architecture/references/testing.md)). A partial scan is reported as partial. Done when every check reads run, failed, unavailable, or not run, and no new scan error exists.
7. **Enforce.** A new boundary gets a rule through the `fe-enforce` skill, or a named gap in the report.
8. **Report** in the output form the level requires.

## Scope control

- A routine feature does not authorize a framework, rendering, or state-library migration; raise it through the `fe-decide` skill.
- Unrelated structural debt found on the way goes under Risks / follow-ups; the `fe-restructure` skill handles it separately.
