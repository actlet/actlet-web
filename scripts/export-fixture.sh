#!/usr/bin/env bash
# Exports an activity recording to the JSONL demo fixture, replacing the
# recording machine's home directory so no local paths are committed.
#
#   scripts/export-fixture.sh <actlet-cli> <recording.actrec> [out.jsonl]
set -euo pipefail
cli=$1
recording=$2
out=${3:-$(cd "$(dirname "$0")/.." && pwd)/fixtures/demo.jsonl}
"$cli" replay export --jsonl "$recording" |
	sed -E 's#/(Users|home)/[^/" ]+/[^," ]*python3#/usr/bin/python3#g; s#/(Users|home)/[^/" ]+#/home/user#g' >"$out"
