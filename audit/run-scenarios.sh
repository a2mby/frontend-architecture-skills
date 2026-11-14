#!/usr/bin/env bash
# Re-runs the scanner against the synthetic audit fixtures. Read-only. Usage: audit/run-scenarios.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; S="$here/../skills/fe-architecture/scripts/fe-scan.mjs"; F="$here/../tests/fixtures"
run(){ echo "######## $1"; shift; node "$S" "$@" --fail-on never | sed "s#$F/##g" | grep -E "ERROR|WARN|\[|summary|unresolved"; }
run "A vite-react (paths only in referenced tsconfig.app.json): expect 1 deep-import, scanner reports 0"   "$F/vite-react/src"
run "A' vite-react with --tsconfig tsconfig.app.json: expect 1 deep-import"                              "$F/vite-react/src" --tsconfig "$F/vite-react/tsconfig.app.json"
run "B laravel-inertia (no features dir, jsconfig ignored): expect cycle, scanner reports none"          "$F/laravel-inertia/resources/js"
run "B2 laravel-features (jsconfig ignored): expect 1 deep-import, scanner reports 0"                     "$F/laravel-features/resources/js"
run "B2' with --tsconfig jsconfig.json: expect 1 deep-import"                                            "$F/laravel-features/resources/js" --tsconfig "$F/laravel-features/resources/js/jsconfig.json"
run "C sveltekit with generated .svelte-kit/tsconfig.json: expect 1 deep-import"                         "$F/sveltekit/src/lib" --features features
run "D monorepo (package deep import + cross-app relative import): expect 2, scanner reports 0"          "$F/monorepo/apps/web/src"
run "E comments/strings only: expect 0 errors, scanner reports 3"                                        "$F/comments/src"
run "G angular (alias deep import = true positive; template-only use = invisible)"                       "$F/angular/src/app"
