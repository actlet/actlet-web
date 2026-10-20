#!/usr/bin/env bash
# Records a scripted Actlet session headless and exports it as a JSONL
# fixture. A scenario directory holds task.json, profile.yaml, model.yaml
# (a script for actlet-devgw's scripted model) and inputs/. An operator
# file, if given, has lines of "<seconds> <command>": gateway commands
# such as "steer …" or "profile-update raise.yaml", sent that many seconds
# after the start; paths in them are relative to the scenario directory.
#
#   scripts/record-fixture.sh <actlet-bin-dir> <scenario-dir> <out.jsonl> [operator-file]
#
# The binaries come from building Actlet's ./cmd/... into a scratch
# directory. KEEP=1 keeps the session folder and logs.
set -euo pipefail
if [ $# -lt 3 ]; then
	echo "usage: $0 <actlet-bin-dir> <scenario-dir> <out.jsonl> [operator-file]" >&2
	exit 2
fi
bin=$(cd "$1" && pwd)
scenario=$(cd "$2" && pwd)
out=$3
operator=${4:+$(cd "$(dirname "$4")" && pwd)/$(basename "$4")}
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/actlet-record.XXXXXX")
cleanup() {
	kill $(jobs -p) 2>/dev/null || true
	wait 2>/dev/null || true
	if [ "${KEEP:-}" = 1 ]; then echo "record: logs kept in $work"; else rm -rf "$work"; fi
}
trap cleanup EXIT
port=$((7600 + RANDOM % 300))
addr=127.0.0.1:$port

mkdir -p "$work/session/inputs" "$work/gateway"
cp -R "$scenario"/inputs/. "$work/session/inputs/"
mkfifo "$work/operator"
(cd "$scenario" && exec "$bin/actlet-devgw" -listen "$addr" -token record -data "$work/gateway" \
	-task task.json -profile profile.yaml -model model.yaml <"$work/operator" >"$work/gateway.log" 2>&1) &
# The operator's commands, at their times; the pipe stays open until the end.
(
	start=$(date +%s)
	if [ -n "$operator" ]; then
		while read -r at command; do
			[ -z "$at" ] || [ "${at#\#}" != "$at" ] && continue
			while [ $(($(date +%s) - start)) -lt "$at" ]; do sleep 0.2; done
			echo "$command"
		done <"$operator"
	fi
	while kill -0 $$ 2>/dev/null; do sleep 1; done
) >"$work/operator" 2>/dev/null &
for _ in $(seq 50); do
	(echo >"/dev/tcp/127.0.0.1/$port") 2>/dev/null && break
	sleep 0.2
done
code=0
ACTLET_GATEWAY=$addr ACTLET_TOKEN=record ACTLET_TOOLS_MANIFEST= "$bin/actlet" run -session "$work/session" >"$work/run.log" 2>&1 || code=$?
echo "record: the run ended with exit code $code"
sleep 1
"$here/export-fixture.sh" "$bin/actlet-cli" "$work"/gateway/*.actrec "$out"
"$bin/actlet-cli" replay inspect "$work"/gateway/*.actrec | sed -n '/^events:/,/^status:/p'
