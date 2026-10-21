// Drives headless Chrome over the DevTools protocol, for the bench and the
// examples check. Dev only.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Starts headless Chrome and connects to its first tab, which is visible, so animation frames run in it. */
export async function launch({ port = 9339 } = {}) {
  const chrome =
    process.env.CHROME ??
    [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
    ].find(existsSync);
  if (!chrome) throw new Error("no Chrome found; set CHROME");
  const profile = mkdtempSync(join(tmpdir(), "actlet-chrome-"));
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
      // CHROME_FLAGS adds flags, such as --no-sandbox on a CI runner.
      ...(process.env.CHROME_FLAGS ?? "").split(" ").filter(Boolean),
      "about:blank",
    ],
    { stdio: "ignore" },
  );
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
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description);
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  };
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      pending.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await call("Runtime.enable");
  await call("Page.enable");
  return {
    call,
    errors,
    async evaluate(expression) {
      const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description);
      return r.result?.result?.value;
    },
    async navigate(url) {
      await call("Page.navigate", { url });
      await new Promise((r) => setTimeout(r, 500));
    },
    async close() {
      ws.close();
      const exited = once(browser, "exit");
      browser.kill();
      await exited;
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

/** Polls fn until it returns something truthy, or throws after the timeout. */
export async function until(fn, what, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
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
