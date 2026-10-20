import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The demo page: plays the committed demo recording.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  build: { outDir: "dist", emptyOutDir: true },
});
