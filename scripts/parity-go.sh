#!/usr/bin/env bash
# Checks that the TypeScript view model and Actlet's Go view model fold
# every fixture to the same view state: dumps each fixtures/*.jsonl with
# `actlet-cli replay view --json` and runs the parity check, strictly.
#
#   scripts/parity-go.sh
#
# ACTLET_CLI=<actlet-cli> uses that binary. Otherwise actlet-cli is built
# from a snapshot of the commit in .actlet-commit (ACTLET_COMMIT overrides)
# of the Actlet repository at ../actlet (ACTLET_REPO overrides), leaving the
# repository as it is. Without a binary, Go or the repository, it skips and
# exits 0, unless REQUIRE_PARITY=1.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/actlet-parity.XXXXXX")
trap 'rm -rf "$work"' EXIT

skip() {
	if [ "${REQUIRE_PARITY:-}" = 1 ]; then
		echo "parity: can't run: $1" >&2
		exit 1
	fi
	echo "parity: skipped: $1"
	exit 0
}

cli=${ACTLET_CLI:-}
if [ -z "$cli" ]; then
	repo=${ACTLET_REPO:-$root/../actlet}
	commit=${ACTLET_COMMIT:-$(cat "$root/.actlet-commit")}
	command -v go >/dev/null || skip "no Go toolchain to build actlet-cli (or set ACTLET_CLI)"
	git -C "$repo" cat-file -e "$commit^{commit}" 2>/dev/null || skip "no Actlet repository with commit $commit at $repo"
	mkdir "$work/src"
	git -C "$repo" archive "$commit" | tar -x -C "$work/src"
	(cd "$work/src" && CGO_ENABLED=0 go build -o "$work/actlet-cli" ./cmd/actlet-cli)
	cli=$work/actlet-cli
	echo "parity: actlet-cli built from ${commit:0:12}"
fi

failed=0
for events in "$root"/fixtures/*.jsonl; do
	name=$(basename "$events" .jsonl)
	if ! "$cli" replay view --json "$events" >"$work/$name.go.json" 2>"$work/$name.err"; then
		echo "parity: $name: actlet-cli can't dump it: $(head -1 "$work/$name.err")"
		failed=1
		continue
	fi
	if PARITY_STRICT=1 PARITY_EVENTS="$events" PARITY_GO="$work/$name.go.json" \
		"$root/node_modules/.bin/vitest" run --root "$root" test/parity.test.ts >"$work/$name.log" 2>&1; then
		echo "parity: $name equal"
	else
		echo "parity: $name DIFFERS"
		grep -E "differences:|≠" "$work/$name.log" | head -50
		failed=1
	fi
done
exit $failed
