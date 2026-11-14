# Svelte and SvelteKit

**Why it exists:** Maps the ownership model onto Svelte 5 (runes) and SvelteKit, where `$lib` and server-only modules give boundaries framework support.
**Use when:** implementing Svelte or SvelteKit features.
**Do not use when:** the project is Svelte 3/4 stores-only (the model applies; verify idioms for that version) or another framework.

Read the installed `svelte` and `@sveltejs/kit` versions and docs first; Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) replaced much of the Svelte 4 store/`$:` idiom.

## Ownership mapping

| Concern                 | Owner                                                                                  | Rule                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Local state             | Component `$state`; derived values with `$derived`                                     | Replace "sync" `$effect`s with `$derived`; effects talk to the outside world only      |
| Shared state            | A `.svelte.ts` module exporting a state object or class, private to the capability     | Export through the capability entry; mutation goes through the module's functions       |
| Server data             | `load` functions (`+page.server.ts` for secrets/DB-free proxy, `+page.ts` universal)   | `load` owns the read; the page receives `data`; do not refetch what `load` returned     |
| Mutations               | Form actions (`+page.server.ts`) with progressive enhancement, or a typed API client   | Actions are exposed endpoints: validate, authorize via the backend, keep rules there    |
| URL state               | `$page.url` / `load` params                                                            | Committed filters live in the URL                                                       |
| Context                 | `setContext`/`getContext` for scoped services                                          | Typed keys exported from the capability entry                                           |

## Boundaries and enforcement

- `$lib` is the shared-code root; capabilities live under `$lib/features/<capability>/` with an `index.ts` entry. `$lib/server/` and `*.server.ts` modules are blocked from client imports by SvelteKit's build, which makes server-only a framework guarantee: use it for secrets and server clients.
- Route files stay thin: compose capability components, call `load`, no business rules.
- Enforce capability privacy with `dependency-cruiser` or ESLint restricted paths over `.svelte` and `.ts`; confirm the resolver knows `$lib`. See [enforcement](../enforcement.md).

## Pitfalls

- Module-level state in a `.svelte.ts` file is shared across requests on the server: keep per-user state out of it during SSR.
- Reading `$state` in `load` or non-reactive contexts does not subscribe; pass values explicitly.
- Binding (`bind:`) across component boundaries hides the owner; prefer a prop plus callback unless the child legitimately owns the value.
