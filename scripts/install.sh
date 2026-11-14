#!/usr/bin/env bash
# Thin wrapper kept for old habits: forwards to the Node installer (cross-platform). Usage: scripts/install.sh [installer options]
exec node "$(cd "$(dirname "$0")" && pwd)/install.mjs" "$@"
