#!/usr/bin/env node
// Measures the viewer on a synthetic 20,000-event session in headless
// Chrome: builds the demo for production, serves it, runs the demo's
// bench (?mode=synthetic&bench=1) and prints its numbers as JSON.
//
// Appends are timed from handing the viewer a batch to the second frame
// after it, so two frames (about 33 ms at 60 Hz) is the least they show.
//
//   pnpm bench            CHROME=/path/to/chrome to choose the browser
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, preview } from "vite";

const config = new URL("../demo/vite.config.ts", import.meta.url).pathname;
const chrome =
  process.env.CHROME ??
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(
    existsSync,
  );
if (!chrome) throw new Error("no Chrome found; set CHROME");

await build({ configFile: config, logLevel: "warn" });
const server = await preview({
  configFile: config,
  preview: { host: "127.0.0.1", port: 5299, strictPort: true },
  logLevel: "warn",
});
const profile = mkdtempSync(join(tmpdir(), "actlet-bench-"));
const port = 9339;
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--no-first-run",
    "--window-size=1400,900",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    "--js-flags=--expose-gc",
    "--enable-precise-memory-info",
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  // The first tab is visible, so animation frames run in it.
  const target = await retry(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find((t) => t.type === "page");
    if (!page) throw new Error("no page yet");
    return page;
  });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === "Runtime.exceptionThrown")
      console.error("page:", msg.params.exceptionDetails.exception?.description);
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  };
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      pending.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await call("Runtime.enable");
  await call("Page.navigate", { url: "http://127.0.0.1:5299/?mode=synthetic&bench=1" });
  const deadline = Date.now() + 180_000;
  let result = null;
  while (!result && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    const r = await call("Runtime.evaluate", {
      expression: "JSON.stringify(window.__bench ?? null)",
      returnByValue: true,
    });
    result = JSON.parse(r.result?.result?.value ?? "null");
  }
  if (!result) throw new Error("the bench didn't finish");
  console.log(JSON.stringify({ browser: "headless Chrome", ...result }, null, 2));
  ws.close();
} finally {
  const exited = once(browser, "exit");
  browser.kill();
  await exited;
  await server.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}

async function retry(fn) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i > 50) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}
