# Project profile

**Why it exists:** Keeps project facts (paths, scripts, authority, debt) out of the architecture rules, so the rules stay portable and the facts stay checkable.
**Use when:** the Locate step starts, a fact about the project is needed, or `fe-init-profile` writes one.
**Do not use when:** the fact is a one-command lookup (`package.json` scripts, `tsconfig` paths): read the environment instead of caching it.

## Where it lives

`docs/frontend-architecture.md` in the target repository, shaped by [the template](../assets/profile.template.md). A monorepo with several frontends puts one profile beside each app (`apps/<app>/docs/frontend-architecture.md`) and names the nearest one in the root `AGENTS.md`.

## How skills use it

1. **Read:** every `fe-*` skill reads the profile first. The profile outranks the defaults in this package; an enforced boundary or an explicit decision record outranks the profile.
2. **Missing:** run discovery inline (scripts, `tsconfig`, lint config, directory layout, `AGENTS.md`), mark each fact `assumed` or `verified`, and offer `/fe-init-profile` to persist it. Do not block the task on a missing profile.
3. **Stale:** when a profile fact contradicts the repository, trust the repository, report the contradiction, and propose the profile edit.
4. **Cache only what the environment cannot say:** the reason behind a convention, the authority split between services, and known debt. Leave script names and versions to their files, and keep the `Commands` table as a hint that is rediscovered each run.

## Sample

[The sample profile](../assets/profile.sample.md) is a filled example: a Next.js frontend over a separate backend and BFF, with known placement debt.
