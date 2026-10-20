#!/usr/bin/env bash
# Compares the TypeScript view model with Actlet's Go view model: folds a
# JSONL event export here, and diffs the view state (docs/view-state.md)
# with the Go model's dump of the same events.
#
#   scripts/parity.sh <events.jsonl> <go-view.json>
#
# Go writes nil slices and maps as null; they count as empty unless
# PARITY_STRICT=1. PARITY_TS_OUT=<file> also writes the TypeScript side.
set -euo pipefail
if [ $# -ne 2 ]; then
	echo "usage: $0 <events.jsonl> <go-view.json>" >&2
	exit 2
fi
root=$(cd "$(dirname "$0")/.." && pwd)
abs() { (cd "$(dirname "$1")" && echo "$(pwd)/$(basename "$1")"); }
PARITY_EVENTS=$(abs "$1") PARITY_GO=$(abs "$2") exec "$root/node_modules/.bin/vitest" run --root "$root" test/parity.test.ts
