# Laravel and Inertia (React or Vue)

**Why it exists:** Maps the ownership model onto Laravel + Inertia.js, where the server owns routing and page props and `resources/js` is the frontend source root.
**Use when:** the project has `inertiajs/inertia-laravel` (or `@inertiajs/react`, `@inertiajs/vue3`) and `resources/js`.
**Do not use when:** the frontend is a standalone SPA calling a Laravel API (use the React or Vue file), or the project uses Livewire or Blade only.

Read the installed `@inertiajs/*`, `laravel/framework`, and starter kit versions first; page directory case (`Pages` or `pages`) and generated helpers differ by version. Record them in the profile.

## What the framework owns

| Piece | Owner | Model rung |
| ----- | ----- | ---------- |
| Routes and controllers | Laravel (`routes/*.php`) | Server composition; the frontend never redefines routes |
| `Pages/` (`Inertia::render('Orders/Index')`) | One component per route, resolved by name | Rung 5: route entry points, thin |
| Layouts (`Layouts/`, persistent layouts) | App composition | Rung 5 |
| Page props | The controller: server is the authoritative owner | Pages receive props; do not copy them into client state to "sync" |
| Shared data (`HandleInertiaRequests::share`) | Server (auth user, flash, locale) | Read through `usePage().props` in one wrapper hook or composable |
| URL and visit state | Inertia router (`router.visit`, `<Link>`, query string) | Committed filters and pagination live in the URL; drafts in the form component (`useForm`) |

## Where capability code lives

- Keep `Pages/` as routing glue. A page composes capability components and passes props; it holds no business rules.
- Put capability code under `resources/js/features/<capability>/` (components, hooks or composables, types) with one public entry, once a capability reaches Moderate. Simple pages stay as one file in `Pages/`.
- `Components/` (or `components/ui`) is app-level shared: domain-free, and never imports `features/`.
- Types for server props live with the capability that renders them; generate them from the backend when the project does (do not hand-copy PHP shapes into three places).
- Forms: `useForm` (React and Vue) owns the draft and submit state; server validation errors arrive as props. Do not mirror them into a store.
- Generated route and action helpers (Wayfinder `@/actions`, `@/routes`, Ziggy `route()`) are infrastructure: import them from the capability that calls them; treat them as external.

## Scanner setup

Run the scanner on `resources/js`. It discovers `jsconfig.json`/`tsconfig.json` there or in the project root. Aliases declared only in `vite.config.*` are not read: mirror `@` in `jsconfig.json`, or add `aliases` in `fe-scan.config.json`. Generated Wayfinder modules appear as unresolved until generated; generate them first or accept a **partial** result and say so. If there is no `features/`, the boundary rules are skipped (`no-capability-dir`); cycles and unresolved coverage still report.

## Pitfalls

- Fetching with `axios` inside a page for data the controller could pass as a prop creates a second authority; prefer props and partial reloads (`only`).
- Shared props growing into a global store of domain data; keep shared data to cross-cutting session facts.
- shadcn-style `components/ui` barrels create import cycles that are generated, not designed: `ignore` them in the scanner config.
