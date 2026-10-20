#!/usr/bin/env node
// Runs the demo's integration examples end to end in headless Chrome
// against the mock servers: each must stream events into the viewer,
// and the live ones must deliver a note and a pause and show them
// accepted.
//
//   pnpm check:examples      SCREENSHOTS=<dir> saves a screenshot of each
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "vite";
import { launch, until } from "./cdp.mjs";

const config = new URL("../demo/vite.config.ts", import.meta.url).pathname;
const server = await createServer({
  configFile: config,
  server: { host: "127.0.0.1", port: 5298, strictPort: true },
  logLevel: "warn",
});
await server.listen();
const page = await launch({ port: 9340 });
const status = () => page.evaluate("document.querySelector('.actlet-status')?.textContent ?? ''");
const entries = () => page.evaluate("document.querySelectorAll('.actlet-entry').length");
let failed = false;

async function check(mode, steps) {
  const started = Date.now();
  try {
    page.errors.length = 0;
    await page.navigate(`http://127.0.0.1:5298/?mode=${mode}&theme=dark`);
    await until(async () => (await entries()) > 5, `${mode}: events in the stream`);
    await steps();
    if (page.errors.length) throw new Error(`page errors: ${page.errors.join("; ")}`);
    if (process.env.SCREENSHOTS) {
      const shot = await page.call("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(process.env.SCREENSHOTS, `example-${mode}.png`), Buffer.from(shot.result.data, "base64"));
    }
    console.log(`ok    ${mode.padEnd(10)} ${((Date.now() - started) / 1000).toFixed(1)}s  ${await status()}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL  ${mode.padEnd(10)} ${e.message}`);
  }
}

/** Sends a note through the command bar and waits for it to be accepted and shown. */
async function note(text) {
  await page.evaluate("document.querySelector('[aria-label=\"Note for the agent\"]').focus()");
  await page.call("Input.insertText", { text });
  await page.evaluate("document.querySelector('.actlet-note-form').requestSubmit()");
  await until(
    () => page.evaluate("!!document.querySelector('.actlet-sent [data-status=\"accepted\"]')"),
    "the note accepted",
  );
  await until(
    () => page.evaluate(`document.querySelector('.actlet-stream').textContent.includes(${JSON.stringify(text)})`),
    "the note shown",
  );
}

/** Raises the money budget through the command bar and waits for the box to report it. */
async function raise(limit) {
  await page.evaluate(
    "[...document.querySelectorAll('.actlet-commands button')].find((b) => b.textContent === 'Raise a budget…').click()",
  );
  await until(() => page.evaluate("!!document.querySelector('.actlet-raise')"), "the raise form");
  await page.evaluate(`(() => {
    const input = [...document.querySelectorAll('.actlet-raise input')].find((i) => i.type === 'number');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(limit))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.actlet-raise').requestSubmit();
  })()`);
  await until(
    () =>
      page.evaluate(
        "[...document.querySelectorAll('.actlet-sent li')].some((li) => li.textContent.startsWith('profile update (budgets)') && li.dataset.status === 'accepted')",
      ),
    "the profile update accepted",
  );
  await until(
    () =>
      page.evaluate(
        "document.querySelector('.actlet-stream').textContent.includes('profile update (budgets) from a remote operator accepted')",
      ),
    "the profile update in the timeline",
  );
}

/** Pauses the session and waits for it to end paused. */
async function pause() {
  await page.evaluate(
    "[...document.querySelectorAll('.actlet-commands button')].find((b) => b.textContent === 'Pause').click()",
  );
  await until(async () => (await status()).includes("paused"), "the session paused");
  await until(
    () => page.evaluate("document.querySelector('[aria-label=\"Note for the agent\"]').disabled"),
    "the input disabled",
  );
}

try {
  await check("websocket", async () => {
    await note("a note over the websocket");
    await raise(1.2);
    await pause();
  });
  await check("sse", async () => {
    await note("a note over server-sent events");
    await pause();
  });
  await check("standard", async () => {
    await until(async () => (await status()).includes("completed"), "the replay at the end", 90_000);
    await until(() => page.evaluate("!!document.querySelector('.actlet-decision')"), "the decision shown");
  });
  await check("jsonl", async () => {
    await until(async () => (await status()).includes("completed"), "the replay at the end", 90_000);
  });
  await check("live", async () => {
    await note("a note in the simulated session");
  });
} finally {
  await page.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
