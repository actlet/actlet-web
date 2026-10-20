import { describe, expect, it } from "vitest";
import { sanitize } from "../src/view/sanitize";
import { fold } from "../src/view/session";
import { Events } from "./helpers";

// Text from tools and models can't drive a terminal or fool the reader.
describe("sanitize", () => {
  it.each([
    ["plain text\n\tindented", "plain text\n\tindented"],
    ["red \x1b[31malert\x1b[0m", "red alert"],
    ["title \x1b]0;pwned\x07 done", "title  done"],
    ["clip \x1b]52;c;ZXZpbA==\x1b\\ end", "clip  end"],
    ["clear\x1b[2J\x1b[H screen", "clear screen"],
    ["over\rwrite", "overwrite"],
    ["bell\x07 and nul\x00", "bell and nul"],
    ["c1 csi \u009b31m red", "c1 csi  red"],
    ["bidi \u202egnp.exe", "bidi gnp.exe"],
    ["lone \ud800 surrogate", "lone \ufffd surrogate"],
    ["dcs \x1bPq#0;2;0;0;0\x1b\\ sixel", "dcs  sixel"],
    ["keypad \x1b= mode", "keypad  mode"],
    ["émoji ✓ 日本 😀", "émoji ✓ 日本 😀"],
    ["cut \x1b[", "cut "],
    ["osc st \x1b]8;;http://x\u009c link", "osc st  link"],
    // Go consumes the escape's final byte only; the rest of the character is invalid.
    ["esc multi \x1bé", "esc multi \ufffd"],
  ])("sanitize(%j)", (input, want) => {
    expect(sanitize(input)).toBe(want);
  });

  it("leaves no control characters in random input", () => {
    let seed = 1;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const alphabet = [
      "\x1b",
      "[",
      "]",
      "\x07",
      "\r",
      "\x00",
      "\u009b",
      "\u009d",
      "\u009c",
      "a",
      "1",
      ";",
      "\\",
      "é",
      "\n",
    ];
    for (let n = 0; n < 2000; n++) {
      let s = "";
      for (let i = 0; i < 20; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
      for (const ch of sanitize(s)) {
        const r = ch.codePointAt(0)!;
        if ((r < 0x20 && r !== 0x0a && r !== 0x09) || (r >= 0x7f && r < 0xa0)) {
          throw new Error(`sanitize(${JSON.stringify(s)}) kept U+${r.toString(16)}`);
        }
      }
    }
  });

  it("is applied to everything folded", () => {
    const e = new Events();
    e.add("root", { case: "toolFinished", value: { callId: "x", tool: "shell\x1b[2J", output: "\x1b]0;evil\x07out" } });
    e.add("root", { case: "text", value: { text: "\x1b[31mtext" } });
    const s = fold(e.out);
    for (const it of s.workers.get("root")!.items) {
      let all = it.text;
      for (const c of it.turn?.calls ?? []) all += c.name + c.output;
      expect(all.includes("\x1b") || all.includes("\x07")).toBe(false);
    }
    for (const l of s.log) expect(l.text.includes("\x1b") || l.text.includes("\x07")).toBe(false);
  });
});
