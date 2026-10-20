#!/usr/bin/env node
// Measures the viewer on a synthetic 20,000-event session in headless
// Chrome: builds the demo for production, serves it, runs the demo's
// bench (?mode=synthetic&bench=1) and prints its numbers as JSON.
//
// Appends are timed from handing the viewer a batch to the second frame
// after it, so two frames (about 33 ms at 60 Hz) is the least they show.
//
//   pnpm bench            CHROME=/path/to/chrome to choose the browser
import { build, preview } from "vite";
import { launch, until } from "./cdp.mjs";

const config = new URL("../demo/vite.config.ts", import.meta.url).pathname;
await build({ configFile: config, logLevel: "warn" });
const server = await preview({
  configFile: config,
  preview: { host: "127.0.0.1", port: 5299, strictPort: true },
  logLevel: "warn",
});
const page = await launch();
try {
  await page.navigate("http://127.0.0.1:5299/?mode=synthetic&bench=1");
  const result = await until(
    async () => JSON.parse((await page.evaluate("JSON.stringify(window.__bench ?? null)")) ?? "null"),
    "the bench",
    180_000,
  );
  console.log(JSON.stringify({ browser: "headless Chrome", ...result }, null, 2));
} finally {
  await page.close();
  await server.close();
}
