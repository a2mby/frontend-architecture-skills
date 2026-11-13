---
name: fe-init-profile
description: Discover a frontend project's facts and write docs/frontend-architecture.md so the other fe-* skills stay portable. Usage - /fe-init-profile [app path]
disable-model-invocation: true
---

Create or refresh the project profile for the app (`$ARGUMENTS`; default: the nearest app). Load the `fe-architecture` skill and read [profile](../fe-architecture/references/profile.md); fill [the template](../fe-architecture/assets/profile.template.md).

## Steps

1. **Read the environment:** `package.json` scripts and versions, lockfile (package manager), `tsconfig` paths and `extends`, lint config, CI files, `AGENTS.md`, existing architecture docs, directory layout. Done when each template field has a source file or is marked `unknown`.
2. **Run the scanner** (`--fail-on never`) to find the capabilities directory, deep-import debt, and cycles. Done when `Known debt` lists the top findings with counts.
3. **Ask only what the repo cannot answer:** backend authority and BFF, shared-contract package, the reason behind non-obvious conventions. Mark answers not yet checked as `assumed`.
4. **Write** `docs/frontend-architecture.md` (or the app-level location for a monorepo). Cache only what the environment cannot say: reasons, authority splits, debt. Leave script bodies and versions to their files and keep the `Commands` table as rediscoverable hints. Done when every line states a reason, an authority split, or debt, or carries a rediscoverable hint.
5. **Wire** a one-line pointer into `AGENTS.md` when it exists: `Frontend architecture profile: docs/frontend-architecture.md`. Done when the pointer resolves to the written file.

When a profile exists, refresh it: keep human-written reasons, update facts the repository contradicts, and list what changed.
