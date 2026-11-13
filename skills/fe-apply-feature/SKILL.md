---
name: fe-apply-feature
description: Add or change a frontend feature with explicit ownership. Usage - /fe-apply-feature <what to build>
disable-model-invocation: true
---

Implement the request (`$ARGUMENTS`) as the smallest coherent change with named owners. Load the `fe-architecture` skill and follow its rules; this skill supplies the order of work.

## Steps

1. **Locate.** Run the shared Locate step. Done when the owner, its public entry, and one real consumer are each named with a file path.
2. **Classify.** Apply the complexity table and tie-break. Done when the level is stated with the evidence for each signal counted.
3. **Specify the contract.** Read the API contract before UI ([API-first](../fe-architecture/references/api-first.md)); load the framework file matching the profile. Write an edge note for every new network edge. Done when each exchanged shape is confirmed in the real contract or labeled `proposed` with a mock plan.
4. **Decide placement.** Walk the Ownership Ladder per new file or shared thing. Complex: write the Module Map before the first file. Done when every new file has an owner and a rung.
5. **Implement** inside the chosen owner. Reuse existing primitives, form stack, and styling system. Interaction, forms, or visuals: read [forms, UI, styling](../fe-architecture/references/forms-ui-styling.md). Done when behavior outside the request is unchanged and each new state has one owner.
6. **Verify.** Run the profile's lint, typecheck, test, and build commands plus the scanner and compare against a pre-change baseline. Add behavioral tests at the changed boundary ([testing](../fe-architecture/references/testing.md)). Done when every check reads run, failed, unavailable, or not run, and no new scan error exists.
7. **Enforce.** A new boundary gets a rule via `/fe-enforce`, or a named gap in the report.
8. **Report** in the output form the level requires.

## Scope control

- A routine feature does not authorize a framework, rendering, or state-library migration; raise it through `/fe-decide`.
- Unrelated structural debt found on the way goes under Risks / follow-ups; `/fe-restructure` handles it separately.
