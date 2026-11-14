# React, Next.js, and React SPAs

**Why it exists:** Maps the ownership model onto React and the Next.js App Router, including the server/client boundary that other frameworks lack.
**Use when:** implementing React code, App Router routes, or a Vite/CRA-style React SPA.
**Do not use when:** the code is framework-agnostic logic (keep it free of framework imports) or the project uses another framework (read its sibling file).

## Read the installed version first

Resolve the installed `next` (or `react`, `react-router`, `@tanstack/*`) package from the app and read its bundled docs or changelog before writing version-sensitive code: file conventions, caching APIs, async request APIs, and renamed or deprecated names. Recall from memory is a hint to verify, not a source. Record the version in the profile.

## Next.js App Router defaults

| Concern                                | Default                                                                                   | Exception                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Route files (`page`, `layout`)         | Thin: compose feature components; fetch through a loader/client; no business logic        | None                                                                                                       |
| Server vs client                       | Server Component; `"use client"` at the smallest interactive leaf                         | The whole subtree needs browser state: put the boundary at its nearest owner                               |
| Data fetching                          | Server-side route or feature loader; never mirror server data into a client store         | Realtime or optimistic UI hands ownership to one client cache                                              |
| Server data on the client              | One owner: the query cache already in the project, or props from the server               | A new cache only when it adds needed behavior (refetch, mutation sync, polling)                            |
| Mutations                              | Server Actions or one typed API client per capability                                     | The project's existing convention wins; apply [minimal surface](../nextjs-minimal-surface.md)               |
| Colocation                             | `app/<route>/_components` for route-only code; `features/` for reusable capabilities      | Framework-mandated paths                                                                                   |
| Context / global store                 | Last resort; name the owner (Module Map when Complex, otherwise the State field)          | Auth, theme, i18n providers with explicit scope                                                            |

A client boundary includes its imported dependency graph: a small file importing a large barrel is not a small browser bundle. Keep server-only configuration unreachable from client entries; use runtime-specific entries (`index.server.ts`, `index.client.ts`) when one barrel would mix them, and never mix `"use client"` and server-only exports in one barrel.

Server-to-client handoff passes serializable contract data. When hydrating a query cache, the cache owns the data from then on: never refresh both props and cache. Fetch in parallel only for independent reads and define which sections survive a partial failure.

## React SPA (Vite or similar)

- The router owns the URL; route modules lazy-load capabilities (`React.lazy` or the router's lazy API) at capability boundaries.
- A client query cache usually owns server data; the URL owns filters and pagination. Auth lives at the transport boundary and in one provider.
- No server runtime exists, so secrets never ship: calls needing a secret go through the backend or a BFF.
- Feature structure, barrels, and enforcement are identical to the App Router case.

## Component and hook ownership (any React app)

- A component owns focused interaction and presentation; extract a hook only for behavior that changes independently, has a second consumer, or needs an isolated test.
- Effects synchronize with the outside world only: derive values during render, handle events in handlers, and keep `useEffect` for subscriptions and imperative APIs.
- Keep context values stable and split high-frequency state from stable configuration; reach for a selector-based store before widening context.

Tradeoff: server rendering solves public first render and SEO with less client code, at the cost of runtime and cache boundaries. Avoid it for purely local interaction. Misuse leaks secrets through imports or produces stale duplicate data. Choose the mode per route with [minimal surface](../nextjs-minimal-surface.md).
