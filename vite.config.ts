import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The library build, and the tests. The demo page has its own config in
// demo/. Modules stay separate files, so bundlers keep only what an app
// uses; tsc writes the declarations next to them.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: { index: "src/lib.ts", core: "src/core.ts" },
      formats: ["es"],
      cssFileName: "viewer",
    },
    rollupOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^@bufbuild\/protobuf($|\/)/],
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: (chunk) => (chunk.name === "lib" ? "index.js" : "[name].js"),
      },
    },
    sourcemap: true,
    minify: false,
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
