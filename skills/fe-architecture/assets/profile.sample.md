---
# Sample profile: a Next.js frontend over a separate backend and BFF. Names and paths are illustrative.
framework: next (App Router; installed docs under node_modules/next/dist/docs)
sourceRoot: apps/storefront/src
packageManager: npm (workspace scripts at the root)
level: modular-monolith
---

# Frontend architecture profile (sample)

## Commands

| Check     | Command                                                              | Scope     |
| --------- | -------------------------------------------------------------------- | --------- |
| lint      | `npm run lint`                                                       | workspace |
| typecheck | `npm run typecheck`                                                  | workspace |
| test      | `npm test` (Node test runner; TS alias registration in the web script) | web       |
| build     | `npm run build`                                                      | workspace |
| cycles    | none: use the scanner                                                |           |

## Layout and conventions

- Capabilities live in `apps/storefront/src/features/<capability>/`; the `editor` capability is split into `model/`, `transactions/`, `server/`.
- Route files compose loaders and feature components (`app/contact/page.tsx` is the reference).
- Shared, domain-free code: `apps/storefront/src/shared/`. Server and browser API entries are separate (`shared/lib/api/api.ts`, `api.browser.ts`) over one contract, parsing, and error authority.
- Alias `@/*` is in use and permits deep imports; resolved boundaries are enforced separately.
- Read first: root `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/FRONTEND_RULES.md`. Root ownership rules supersede older deployment descriptions.

## Runtime and data authority

- Backend authority: the business-rules service (owns persistence). `apps/api` is the HTTP BFF. Apps communicate over HTTP.
- Shared contract package: `@acme/contracts`; verify its live exports before consuming (`verified: no`).
- Server data owner: route or feature loader. No TanStack Query installed; do not add a second state or data framework to satisfy a default.
- Forms: React Hook Form with Zod, colocated schemas. Zustand is installed.

## Enforced boundaries

- ESLint restricts `editor/model -> editor/ui` and design-token dependencies. Extend these rules instead of replacing them.

## Known debt

- Some domain DTOs, API code, and editor state live in `shared/`, and some consumers deep-import them. Preserve routes during scoped work, flag it when relevant, and add no new domain-wide promotion by analogy.

## Decision register

- `docs/architecture/decisions/` plus a tracker in `docs/RULES.md`.
