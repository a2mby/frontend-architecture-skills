# Real-world validation

A scanner run on a public repository that anyone can reproduce. Recorded 2026-11-14 with `fe-scan` 0.2.0.

| | |
| --- | --- |
| Repository | https://github.com/alan2207/bulletproof-react |
| Commit | `9506629ed003a561c6627735480cce4994244bb4` (2026-05-14) |
| App scanned | `apps/react-vite` (127 source files under `src`, 5 capabilities under `src/features`) |
| Config | none; `tsconfig.json` paths (`@/*`) discovered automatically |

## Reproduce

```bash
node evals/real-world/reproduce.mjs
```

It fetches that commit into a fresh empty temp directory (no install, no project scripts run), scans, and compares with [bulletproof-react.json](../evals/real-world/bulletproof-react.json). Needs git and network access.

## Results

**Run 1, defaults** (`fe-scan.mjs apps/react-vite/src`): coverage complete (331 of 331 project-internal imports resolved), **0 errors**, 0 warnings, 8 info: 5 `unguarded-capability` and 3 `no-public-entry`. No cycles, no `shared` importing a capability, no feature-to-feature deep import.

**Run 2, forcing the contract** (`--entry-policy root-only`): **14 errors**, all `deep-import`, every one from the route layer (`app/routes/**`) importing a file inside a capability (for example `features/comments/api/get-comments.ts`).

The Next.js app in the same repository (`apps/nextjs-app`) has the same shape and is not separately pinned.

## Investigation of the 14 findings

The first version of the scanner (0.2.0 before this change) reported the 14 errors by default. Root-cause analysis, one category per finding:

| Candidate cause | Verdict |
| --- | --- |
| Scanner defect (wrong resolution, comments, aliases) | No: all 331 imports resolve and each of the 14 edges is a real import of a file inside a capability |
| Legitimate architectural violation | No by this repository's own convention: its features have no public entry file, and its route layer imports feature files directly. Capability-to-capability imports (the boundary that matters here) number zero |
| Incorrectly inferred convention | **Yes.** The scanner assumed every capability exposes one public entry. For a capability that declares none, there is no contract for a composition-layer import to violate |
| Configuration issue | Partly: the repo could set `entryPolicy: declared` with `publicEntries`, but demanding configuration for a repo that never declared an entry was the wrong default |

Fix: composition-layer imports (files outside every capability and outside `shared/`) into a capability that has no public entry are reported as one `unguarded-capability` info per capability, not as `deep-import` errors, when the entry policy is the default or detected. Imports between capabilities, `shared` importing a capability, and any explicitly configured policy are unchanged (regression tests: no-barrel repo, `app/` to feature file passes; feature A to feature B internals still errors; shared still errors; a capability that does have an entry still errors; the 83-import legacy-app ratchet is unchanged).

No ignore was added to reach 0.

## Interpretation

What the run demonstrates: alias resolution on a Vite project, full coverage reporting, correct attribution of findings, and that a repo with a different, coherent convention (direction-restricted, no barrels) is not condemned by default. The scanner does **not** check this repository's actual rule (features must not import from other features, enforced there by lint). For layer and direction rules use `eslint-plugin-boundaries`, Steiger, Nx tags or `dependency-cruiser`.

## Known limitations of this validation

- One repository, one commit; it shows the scanner behaves sensibly on a well-structured public app, not that it is correct in general.
- Only the scanner was evaluated, not agent behavior on this repository.
- The `no-public-entry` and `unguarded-capability` infos are advisory for repositories that deliberately have no barrels.
- Earlier private-codebase runs (four anonymized apps: Next.js with 83 deep imports and no boundary rules; Next.js with a capability cycle; Laravel + Inertia + Vue with shadcn-style generated cycles and Wayfinder-generated unresolved imports; a small Next.js app) motivated the baseline, ignore, and coverage features. They are contextual evidence only and cannot be reproduced from this repository; `tests/` contains synthetic equivalents of each shape.
