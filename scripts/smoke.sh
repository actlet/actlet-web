#!/usr/bin/env bash
# Packs the library and builds a fresh Vite app that installs the tarball:
# one page with the viewer, one with only @actlet/viewer/core. The app must
# type-check against the published declarations and build, and the core
# page must not pull in React. Needs network access to install the app's
# own dependencies. KEEP=1 leaves the app in place.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/actlet-smoke.XXXXXX")
[ "${KEEP:-}" = 1 ] || trap 'rm -rf "$work"' EXIT

(cd "$root" && pnpm -s build >/dev/null && pnpm pack --pack-destination "$work" >/dev/null)
tarball=$(ls "$work"/*.tgz)
echo "packed $(basename "$tarball"): $(tar -tzf "$tarball" | wc -l | tr -d ' ') files"
for theme in dark light plain; do
	tar -tzf "$tarball" | grep -qx "package/themes/$theme.yaml" || { echo "smoke: themes/$theme.yaml isn't packed" >&2; exit 1; }
done

app=$work/app
mkdir -p "$app/src" "$app/public"
cp "$root/fixtures/demo.jsonl" "$app/public/"
cat >"$app/package.json" <<EOF
{
  "name": "viewer-smoke",
  "private": true,
  "type": "module",
  "dependencies": { "@actlet/viewer": "file:$tarball", "react": "^19.0.0", "react-dom": "^19.0.0" },
  "devDependencies": {
    "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0", "@vitejs/plugin-react": "^6.0.0",
    "typescript": "~6.0.0", "vite": "^8.0.0"
  }
}
EOF
cat >"$app/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2023", "DOM"], "module": "ESNext", "moduleResolution": "bundler",
    "jsx": "react-jsx", "strict": true, "skipLibCheck": false, "noEmit": true, "types": ["vite/client"]
  },
  "include": ["src"]
}
EOF
cat >"$app/vite.config.ts" <<'EOF'
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [react()], build: { rollupOptions: { input: { viewer: "index.html", core: "core.html" } } } });
EOF
cat >"$app/index.html" <<'EOF'
<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>viewer</title></head>
<body><div id="root" style="height: 100vh"></div><script type="module" src="/src/main.tsx"></script></body></html>
EOF
cat >"$app/core.html" <<'EOF'
<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>core</title></head>
<body><pre id="out"></pre><script type="module" src="/src/core.ts"></script></body></html>
EOF
cat >"$app/src/main.tsx" <<'EOF'
import { ActivityViewer, parseJsonl, type ActivityEvent, type Command } from "@actlet/viewer";
import "@actlet/viewer/styles.css";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  useEffect(() => {
    fetch("/demo.jsonl").then((r) => r.text()).then((t) => setEvents(parseJsonl(t)));
  }, []);
  return (
    <ActivityViewer
      events={events}
      onCommand={(cmd: Command) => console.log(cmd.id)}
      theme={{ base: "light", colors: { accent: "#d33682" }, emphasis: { key: ["bold"] } }}
    />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
EOF
cat >"$app/src/core.ts" <<'EOF'
import { files, fold, parseJsonl, parseTheme } from "@actlet/viewer/core";
import light from "@actlet/viewer/themes/light.yaml?raw";

if (!light.includes("name: light") || parseTheme({ base: "plain" }).colors.accent !== "none") throw new Error("themes");

const session = fold(parseJsonl(await (await fetch("/demo.jsonl")).text()));
document.getElementById("out")!.textContent = JSON.stringify(files(session));
EOF

cd "$app"
pnpm install --silent
pnpm exec tsc
pnpm exec vite build --logLevel warn
echo "built: $(ls dist/assets | tr '\n' ' ')"
# The core page's own scripts: its entry and what it preloads.
core_js=$(grep -o '/assets/[^"]*\.js' dist/core.html | sed 's#^/#dist/#')
if grep -l 'react\.element\|useState\|__SECRET_INTERNALS\|react-dom' $core_js; then
	echo "smoke: the core page pulls in React" >&2
	exit 1
fi
echo "smoke: ok (the core page has no React: $(du -ch $core_js | tail -1 | cut -f1))"
[ "${KEEP:-}" = 1 ] && echo "app left in $app"
