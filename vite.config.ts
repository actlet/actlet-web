import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The library build, and the tests. The demo page has its own config in
// demo/.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/lib.ts",
      formats: ["es"],
      fileName: "index",
      cssFileName: "viewer",
    },
    rollupOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^@bufbuild\/protobuf($|\/)/],
    },
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
