# Vue and Nuxt

**Why it exists:** Maps the ownership model onto Vue 3 (Composition API) and Nuxt, where auto-imports and file routing change how boundaries are enforced.
**Use when:** implementing Vue 3 or Nuxt features.
**Do not use when:** the project is Vue 2 / Options-API-only (the model still applies; verify idioms against that version) or another framework.

Read the installed `vue`, `pinia`, `vue-router`, and `nuxt` versions and their docs first; Nuxt 3 and 4 differ in directory layout (`app/` source root in 4).

## Ownership mapping

| Concern                 | Owner                                                                                   | Rule                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Local interaction state | Component (`ref`, `reactive`, `computed`)                                               | Derive with `computed`; never copy a prop or store value into a `ref` to keep it in sync |
| Reusable behavior       | Module composable (`useX`) inside the capability                                        | Composables own one concern; expose refs and functions, keep internals private          |
| Shared client state     | Pinia setup store, private to the capability; exported only through its entry           | One store per capability concern; stores never import components                       |
| Server data             | Nuxt `useAsyncData` / `useFetch`, or the query library already installed                | One owner per resource; key includes every input that changes the result                |
| URL state               | `vue-router` query and params                                                           | Committed filters and pagination live here, drafts in the filter component             |
| Provide/inject          | Scoped configuration (theme, i18n, a capability's service)                              | Typed injection keys exported from the capability entry                                |

## Boundaries and enforcement

- Public entry: the capability's `index.ts` exporting components, composables, and types. Single-file components import siblings relatively and other capabilities only through the entry.
- Nuxt auto-imports (`components/`, `composables/`, `utils/`) bypass the import graph: a boundary rule cannot see them. For capability code, import explicitly, keep capabilities in `layers/` or a feature folder with auto-import disabled for it, and verify the project's `imports.dirs` / `components.dirs` configuration.
- Nuxt server code lives in `server/` (Nitro). It is a BFF surface: apply [minimal surface](../nextjs-minimal-surface.md) (thin proxy, no duplicated business rules). Shared types may cross; runtime code may not.
- Enforce with `eslint-plugin-boundaries` or `dependency-cruiser` over `.vue` and `.ts`; check that the resolver handles the `~/` or `@/` alias and `.vue` extension. See [enforcement](../enforcement.md).

## Pitfalls

- `reactive` destructuring loses reactivity; use `toRefs` or access through the object.
- Pinia options stores in new code add little over setup stores; follow the project's existing style.
- SSR: browser-only APIs inside `setup` break server render; guard with `onMounted` or `import.meta.client`.
- `v-model` on a prop-backed value needs an explicit emit contract or `defineModel` (check the installed Vue version).
