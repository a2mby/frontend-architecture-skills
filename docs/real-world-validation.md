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

**Run 1, defaults** (`fe-scan.mjs apps/react-vite/src`): coverage complete (331 of 331 project-internal imports resolved), **14 errors**, 0 warnings, 3 info.

- 14 `deep-import` errors, every one from the route layer (`app/routes/**`) importing a file inside a capability (for example `features/comments/api/get-comments.ts`).
- 3 `no-public-entry` info items (`comments`, `discussions`, `users` have no `index.*`).
- No cycles, no `shared` importing a capability.

**Run 2, composition layer ignored** (`--ignore 'app/**'`): coverage complete, **0 errors**, 3 info. That shows there is no feature-to-feature deep import: the only boundary-style violations the scanner can see are app-to-feature imports.

The Next.js app in the same repository (`apps/nextjs-app`) gives 17 errors with the same shape (all from `app/`), which is expected, not separately pinned.

## Interpretation and false positives

The 14 errors are false positives **relative to this repository's convention**, not defects. This codebase does not give each feature a public entry file; its route layer imports feature files directly, and cross-feature isolation is the rule that matters. The scanner's default model (a capability exposes one public entry) is the wrong model here, which is the point of F-20: the right responses are (a) `--ignore 'app/**'` or `ignore` in `fe-scan.config.json` to check only feature-to-feature edges, as in run 2, or (b) a layered rule in a tool built for that (`eslint-plugin-boundaries`, `dependency-cruiser`). Per the model's own precedence, a healthy existing convention wins over the default; a report that tells this repository to add barrels would be wrong.

What the run does demonstrate: path-alias resolution on a Vite project, full coverage reporting, correct attribution of each finding to a source line, and the ignore mechanism.

## Known limitations of this validation

- One repository, one commit; it shows the scanner behaves sensibly on a well-structured public app, not that it is correct in general.
- Only the scanner was evaluated, not agent behavior on this repository.
- The `no-public-entry` info is noise for repositories that deliberately have no barrels.
- Earlier private-codebase runs (four anonymized apps: Next.js with 83 deep imports and no boundary rules; Next.js with a capability cycle; Laravel + Inertia + Vue with shadcn-style generated cycles and Wayfinder-generated unresolved imports; a small Next.js app) motivated the baseline, ignore, and coverage features. They are contextual evidence only and cannot be reproduced from this repository; `tests/` contains synthetic equivalents of each shape.
