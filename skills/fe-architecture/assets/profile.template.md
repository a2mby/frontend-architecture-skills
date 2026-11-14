---
# Frontend architecture profile. Project facts the fe-* skills read; edit freely.
# Keep every value verifiable: if a fact cannot be checked in the repo, mark it `assumed`.
framework: <next | react-spa | vue | nuxt | svelte | sveltekit | angular | other> <installed version>
sourceRoot: <path of the app source, e.g. src or apps/<app>/src>
packageManager: <npm | pnpm | yarn | bun>
level: modular-monolith   # change only when an extraction trigger fires
---

# Frontend architecture profile

## Commands (taken from package.json / CI, rediscovered each run)

| Check       | Command                  | Scope          |
| ----------- | ------------------------ | -------------- |
| lint        | `<command>`              | <app/workspace> |
| typecheck   | `<command>`              | |
| test        | `<command>`              | |
| build       | `<command>`              | |
| cycles      | `<command>` or `none`    | |

## Layout and conventions

- Capabilities live in: `<path>` (example: `src/features/<capability>/`)
- Public entry per capability: `<index.ts | package entry | other>`
- Shared (no business knowledge): `<path>`
- Path aliases: `<alias -> target, note whether @/* permits deep imports>`
- File naming and test placement: `<conventions worth keeping>`
- Authoritative docs to read first: `<AGENTS.md, architecture docs>`

## Runtime and data authority

- Backend authority: `<service that owns business rules and persistence>`
- BFF / gateway: `<name or none>`
- Shared contract package: `<name or none>`; verified shape: `<yes/no/assumed>`
- Server data owner by default: `<server component fetch | query cache | other>`
- Form and validation stack: `<libraries>`
- Mocking approach: `<MSW | fixtures | none>`

## Enforced boundaries (what tooling already blocks)

- `<rule, tool, config file>`; or `none`

## Known debt (preserve during unrelated work, flag when relevant)

- `<ownership issue, where, why it was left>`

## Decision register

- `<path to ADR folder or tracker>`; or `none`
