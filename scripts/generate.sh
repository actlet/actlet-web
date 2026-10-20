#!/usr/bin/env bash
# Generates TypeScript types for the Actlet activity events from the
# gateway contract. PROTO_DIR defaults to a sibling checkout of actlet.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
proto=${PROTO_DIR:-$root/../actlet/proto}
rm -rf "$root/src/gen"
mkdir -p "$root/src/gen"
protoc -I "$proto" \
	--plugin=protoc-gen-es="$root/node_modules/.bin/protoc-gen-es" \
	--es_out="$root/src/gen" \
	--es_opt=target=ts,json_types=true,import_extension=none \
	actlet/gateway/v0/gateway.proto
