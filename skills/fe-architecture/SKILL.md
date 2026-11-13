---
name: fe-architecture
description: Frontend architecture model for ownership, boundaries, and placement (React, Next.js, Vue, Nuxt, Svelte, SvelteKit, Angular). Load when adding or placing a frontend feature, deciding where code lives, splitting a module, breaking an import cycle, reviewing frontend structure, or choosing state, data, or rendering ownership. Skip for styling tweaks and single-component bugs.
---

# Frontend architecture

The one place that defines the model. The `fe-*` workflow skills (`fe-apply-feature`, `fe-check-structure`, `fe-restructure`, `fe-review`, `fe-decide`, `fe-enforce`, `fe-init-profile`) run procedures on top of it and never restate it.

## Mission

Make the smallest coherent change whose behavior, state, and dependencies each have a named **owner**. Split what changes independently; keep together what always changes together. Folder tidiness alone is not architecture.

## Stance

1. **Boundaries follow capabilities.** A capability is a user-facing or backend-aligned slice of behavior (checkout, search, chat). Organize by capability first, technical role second.
2. **Modular monolith first.** One deployable app with enforced internal boundaries. Extract to a package or micro-frontend only when a **tripwire** fires: independent team, independent deploy cadence, divergent stack, or contractual isolation.
3. **Every boundary is a contract.** A capability exposes one **public entry** (types, functions, components); everything behind it is private.
4. **Reversible first.** When two options fit, take the one cheaper to undo and name the tripwire that would revisit it.
5. **Tooling enforces boundaries.** A rule that only lives in prose is a wish: pair every boundary with an import rule or a cycle check.
6. **Existing healthy convention wins.** Precedence, highest first: enforced boundary, decision record, project profile, observed repo convention, these defaults. Flag a convention that causes the problem instead of silently diverging.

## Vocabulary

| Term         | Meaning                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| Capability   | Slice of behavior with its own workflows, state, and rules; the unit of ownership                          |
| Module       | Functional sub-area inside one capability (`composer`, `thread`); sibling modules talk through narrow APIs |
| Public entry | The single import path other code may use (`index.ts`, package entry, `public-api.ts`)                     |
| Owner        | The module or layer holding the authoritative state or rule                                                |
| Profile      | The target repo's project facts, read first: [profile](references/profile.md)                              |
| Tripwire     | A measurable event that forces revisiting a decision                                                       |

## Locate (shared first step of every workflow)

1. Read the project profile (`docs/frontend-architecture.md`), root `AGENTS.md`, and the decision register. Missing profile: discover inline, label facts `assumed` or `verified`, and carry on.
2. Find the capability that owns the request. Read its public entry, one consumer, and the state/data path. Trace imports; folder names do not prove ownership.
3. No existing owner: say so and name the proposed one.

Done when the owner, its entry, and one real consumer are each named with a file path.

## Complexity level

Evaluate Complex, then Moderate, then Simple. Count user workflows, not components.

| Level    | Signals                                                                                                                                                                                                                | Default structure                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Simple   | 1 workflow, local state, about 5 files or fewer                                                                                                                                                                        | Flat, colocated beside the consumer; no folder ceremony, no barrel          |
| Moderate | 2-3 workflows, or server data plus local UI state, or reuse in 2+ routes                                                                                                                                               | Capability folder: `components/`, one data owner, one public entry          |
| Complex  | Two or more **firm** signals: 4+ workflows; shared state across sub-areas; own domain or editor rules; multiple integrations; sub-areas that change independently; a module people avoid (cite reported regressions)  | Functional modules, Module Map before code, enforced boundaries             |

Firm and arguable apply only to the Complex-row signals; the Moderate row never needs them. A signal is **firm** when it cites evidence: a second integration, a reported regression, independently changing sub-areas shown in history. A signal that rests on a guess is **arguable**. Levels belong to a capability, never to a whole app.

**Tie-break:** one firm signal plus one arguable signal is Moderate, plus a written tripwire ("promote to Complex when a second integration lands"). Splitting a folder later is cheap, so the lower level is the reversible choice. File count alone never raises a level: a flat 9-file feature with one workflow stays Simple, and the reason is stated.

| Case                                                                                | Level    | Evidence                                                                         |
| ----------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| Footer newsletter form, one POST                                                    | Simple   | 1 workflow, local state                                                          |
| Directory with API pagination and a local filter panel                              | Moderate | Server data plus local UI; one read workflow                                     |
| Multi-step checkout with a payment SDK and its own validation rules                 | Complex  | Firm: second integration (payments) and own domain rules; one workflow is enough |
| Settings area, 3 tabs sharing one saved form, one API                               | Moderate | 3 workflows, no second firm signal                                               |
| Dashboard, 6 widgets over one API with independent loading                          | Moderate | Workflows are widgets sharing a data owner; raise only on a reported regression  |
| Chat: list, thread, composer, realtime, unread counts                               | Complex  | Firm: 4+ workflows, shared message state, realtime integration                   |

Split by **change rate**, not size.

## Ownership Ladder

Top-down; stop at the first match. Wiring, routing, providers, and bootstrap code is rung 5: application composition, not reusable behavior.

1. Used by one component: colocate beside it.
2. Used by one module: inside that module, private.
3. Used by several modules of one capability: `capability/_shared/`, never exported outside the capability.
4. Used by 2+ unrelated capabilities and carrying no domain knowledge: app-level `shared/`.
5. Wiring, routing, providers, bootstrap: app level only.

Promote only when a **second real consumer** exists and both share a responsibility, not just a look. Domain-aware code stays with its capability; other capabilities use its public entry.

## State and dependency rules

- **One authoritative owner per datum**, chosen from: server, URL, query cache, local or module state, browser storage, session cookie. Derive counts, flags, and filtered views instead of syncing copies.
- An editable **draft** is separate state with explicit reset and commit semantics, never a second server authority.
- State changes go through the owning module. Keep state near its consumers; lift it to the nearest coordinator only when several consumers need it. Shared access alone does not justify a global store.
- Composition layers coordinate capabilities; shared infrastructure never imports capability behavior. Name every new dependency edge and why its direction is allowed.
- Siblings use direct calls or props and callbacks. Use events only for an existing event contract or independently timed producers and consumers.
- A component owns focused interaction and presentation; extract behavior when it changes independently, gains a second consumer, or needs an isolated test, and preserve semantic, accessible composition.

## Notes this model asks for

**Tradeoff note** (one line, written once per structural choice): *solves* what, *costs* what, *not when* the choice is wrong, *misuse breaks* what.

**Edge note** (required whenever a new network edge, cache, or mutation appears, at any level): read or mutation operation and contract; owner and key; freshness and invalidation; consistency (wait or optimistic with reconciliation); failure behavior (loading, empty, error, timeout, retry); duplicate-write guard. Details in [system design](references/system-design.md).

**Module Map** (Complex only, written before the first implementation file): fill [the template](assets/module-map.template.md).

## Output forms

- **Short form** for advisory answers, trivial edits, and Simple work: `Owner`, `Placement`, `Verified` (use `not run: advisory task` when nothing ran).
- **Full form** for Moderate and Complex implementation, refactors, and reviews: [the output template](assets/output-contract.template.md); Complex prepends the Module Map.
- End on the chosen form with no second conclusion after it.

## References: load the one whose trigger fires

- [Profile](references/profile.md): a project fact is needed, or a profile must be created.
- [Feature-based pattern](references/feature-based.md): no repo convention exists, a capability folder is being created, or monorepo and extraction boundaries are in play.
- Framework mapping: [React and Next.js](references/frameworks/react-next.md), [Vue and Nuxt](references/frameworks/vue-nuxt.md), [Svelte and SvelteKit](references/frameworks/svelte-sveltekit.md), [Angular](references/frameworks/angular.md). Load the one matching the project's framework.
- [Examples](references/examples.md): classifying a capability or weighing whether a split earns its cost.
- [Anti-patterns](references/anti-patterns.md): a structural symptom appears (growing `utils`, cycle, duplicated rule, store mirroring server data).
- [Refactoring](references/refactoring.md): boundaries are about to move.
- [Enforcement](references/enforcement.md) and [configs](references/enforcement-configs.md): checks run, or a rule is added.
- [Decisions](references/decision-making.md): a one-way door (framework, rendering mode, state library, auth, API contract, package split).
- [System design](references/system-design.md): a network edge, cache, shared state, heavy dependency, or non-functional constraint appears.
- [API-first](references/api-first.md): API consumption, validation, errors, pagination, auth, or mocks change.
- [Minimal Next.js surface](references/nextjs-minimal-surface.md): Next.js versus SPA, rendering mode, or server endpoints, actions, and proxy code.
- [Forms, UI, styling](references/forms-ui-styling.md): interaction, forms, or visuals inside an in-scope feature.
- [Testing](references/testing.md): choosing coverage or verifying a changed boundary.
- Scanner: from the project root, run `node <this skill's directory>/scripts/fe-scan.mjs <sourceRoot>` (the profile's `sourceRoot`, relative to the project root). It reports boundary violations, cycles, and structure smells with no install. Workflows say "run the scanner" and mean this command. Flags and limits: [enforcement](references/enforcement.md).

## Self-review

- [ ] Every new piece of state has one named owner
- [ ] No import into another module's internals, no new cycle
- [ ] Nothing promoted to `shared/` without a second real consumer
- [ ] Structure is no heavier than the level justifies, and the level cites evidence
- [ ] Existing behavior unchanged unless requested
- [ ] Checks ran, with results reported as run, failed, unavailable, or not run
- [ ] Boundaries match capabilities, expose one contract, and have an enforcing rule or a named gap
- [ ] A new engineer can say where the next change goes
