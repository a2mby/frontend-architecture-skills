# Angular

**Why it exists:** Maps the ownership model onto modern Angular (standalone components, signals, DI), where the injector tree and templates shape ownership.
**Use when:** implementing Angular features.
**Do not use when:** the project is NgModule-only legacy and migration is not in scope (the model applies; follow its module conventions) or another framework.

Read the installed `@angular/core` version and its docs first; standalone components, signals, `inject()`, and the new control flow are default in recent versions but absent in old ones.

## Ownership mapping

| Concern                 | Owner                                                                                     | Rule                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Local interaction state | Component `signal` / `computed`                                                           | Derive with `computed`; do not mirror inputs into signals                                  |
| Capability behavior     | Feature-scoped injectable (`providedIn` the feature's route or component `providers`)     | Scope services to the feature so they die with it; root-provided only for app lifetime     |
| Server data             | A feature data service wrapping `HttpClient` (or `httpResource`/`resource` where adopted) | One owner per resource; components never call `HttpClient` directly                        |
| Cross-cutting transport | HTTP interceptors (auth, error normalization, correlation id)                             | Implement once at the transport boundary                                                   |
| URL state               | Router params / query params                                                              | Committed filters live here                                                                |
| Forms                   | Typed reactive forms owned by the form component                                          | Server errors map onto controls; drafts reset on confirmed success                         |

## Boundaries and enforcement

- A capability is a folder (or Nx library) with a `public-api.ts` / `index.ts`; routes lazy-load it (`loadChildren` / `loadComponent`) so the bundle boundary equals the capability boundary.
- Enforce with Nx `@nx/enforce-module-boundaries` (tags such as `scope:orders`, `type:feature|ui|data-access|util`) in an Nx workspace, otherwise `eslint-plugin-boundaries` or `dependency-cruiser`. Prefer tags that mirror the capability and role split in [feature-based](../feature-based.md).
- Template references do not appear in the TypeScript import graph; check standalone `imports: []` arrays in review for cross-capability components.

## Pitfalls

- Subscriptions leak unless tied to lifetime: prefer `async` pipe, `toSignal`, or `takeUntilDestroyed`.
- A root-provided service becomes hidden global state; justify each one.
- `OnPush` and signals assume immutable updates; mutating objects in place skips change detection.
