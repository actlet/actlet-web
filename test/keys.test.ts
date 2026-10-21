import { describe, expect, it } from "vitest";
import { actionFor, keyName, REPLAY_KEYS, STREAM_KEYS, VIEWER_KEYS } from "../src/react/keys";

describe("the key map", () => {
  it("matches keys as the browser reports them", () => {
    const press = (key: string, mods: { shiftKey?: boolean; ctrlKey?: boolean } = {}) => ({
      key,
      shiftKey: false,
      ...mods,
    });
    expect(actionFor(VIEWER_KEYS, press("?", { shiftKey: true }))).toBe("help");
    expect(actionFor(REPLAY_KEYS, press("ArrowLeft"))).toBe("back");
    expect(actionFor(REPLAY_KEYS, press("ArrowLeft", { shiftKey: true }))).toBe("back10");
    expect(actionFor(REPLAY_KEYS, press("+", { shiftKey: true }))).toBe("faster");
    expect(actionFor(REPLAY_KEYS, press(" "))).toBe("toggle");
    expect(actionFor(REPLAY_KEYS, press("K", { shiftKey: true }))).toBeUndefined();
    expect(actionFor(STREAM_KEYS, press("j"))).toBe("next");
    expect(actionFor(STREAM_KEYS, press("j", { ctrlKey: true }))).toBeUndefined();
  });

  it("names keys for the help", () => {
    expect(["ArrowUp", " ", "Escape", "Shift+ArrowRight", "+", "Home"].map(keyName)).toEqual([
      "↑",
      "Space",
      "Esc",
      "Shift →",
      "+",
      "Home",
    ]);
  });
});
