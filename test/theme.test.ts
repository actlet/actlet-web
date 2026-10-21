import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  BUILTIN_THEMES,
  THEME_TOKENS,
  ThemeError,
  cssColor,
  parseTheme,
  themeLook,
  themeVariables,
  xtermColor,
} from "../src/view/theme";
// @ts-expect-error: a dev script without types
import { themeCss } from "../scripts/theme-css.mjs";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("the built-in themes", () => {
  for (const name of ["dark", "light", "plain"] as const) {
    it(`${name} is the same as themes/${name}.yaml, every token given`, () => {
      const file = parse(read(`themes/${name}.yaml`));
      expect({ name: file.name, colors: file.colors, emphasis: file.emphasis }).toEqual(BUILTIN_THEMES[name]);
      expect(() => parseTheme(file)).not.toThrow();
      expect(Object.keys(file.colors)).toEqual([...THEME_TOKENS]);
    });
  }

  it("are the stylesheet's theme blocks", () => {
    expect(read("src/styles.css")).toContain(themeCss());
  });

  it("define every property the stylesheet uses without a fallback", () => {
    const css = read("src/styles.css");
    const defined = new Set([...css.matchAll(/^\s*(--actlet-[\w-]+):/gm)].map((m) => m[1]));
    const used = new Set([...css.matchAll(/var\((--actlet-[\w-]+)\)/g)].map((m) => m[1]));
    expect([...used].filter((v) => !defined.has(v))).toEqual([]);
  });
});

describe("theme files", () => {
  it("take the tokens they don't give from their base", () => {
    const t = parseTheme({ name: "mine", base: "light", colors: { accent: "#d33682", ok: "2", background: "none" } });
    expect(t.name).toBe("mine");
    expect(t.colors.accent).toBe("#d33682");
    expect(t.colors.text).toBe(BUILTIN_THEMES.light.colors.text);
    expect(parseTheme({}).colors).toEqual(BUILTIN_THEMES.dark.colors);
    const v = themeVariables(t);
    expect(v["--actlet-ok"]).toBe("#00cd00");
    expect(v["--actlet-background"]).toBe("Canvas");
  });

  it("replace the base's emphasis of the tokens they name", () => {
    const t = parseTheme({ emphasis: { accent: [], key: ["bold", "underline"], comment: null } });
    expect(t.emphasis).toEqual({ accent: [], key: ["bold", "underline"], comment: [] });
    const v = themeVariables(t);
    expect(v["--actlet-accent-weight"]).toBeUndefined();
    expect(v["--actlet-key-weight"]).toBe("700");
    expect(v["--actlet-key-line"]).toBe("underline");
    expect(v["--actlet-comment-style"]).toBeUndefined();
  });

  it("refuse what the terminal viewer refuses", () => {
    const bad: [unknown, RegExp][] = [
      [null, /a theme is an object/],
      [[], /a theme is an object/],
      [{ colours: {} }, /unknown field "colours"/],
      [{ base: "solarized" }, /base "solarized" isn't a built-in theme/],
      [{ name: 3 }, /name: give a string/],
      [{ colors: { accnet: "#fff" } }, /colors: unknown token "accnet"/],
      [{ colors: { accent: "red" } }, /colors.accent: "red" isn't a colour/],
      [{ colors: { accent: "#12" } }, /isn't a colour/],
      [{ colors: { accent: "256" } }, /isn't a colour/],
      [{ colors: { accent: 2 } }, /isn't a colour/],
      [{ colors: { accent: null } }, /isn't a colour/],
      [{ colors: [] }, /colors: give colours by token/],
      [{ emphasis: { accent: "bold" } }, /emphasis.accent: give a list/],
      [{ emphasis: { accent: ["blink"] } }, /unknown attribute "blink"/],
      [{ emphasis: { nope: ["bold"] } }, /emphasis: unknown token "nope"/],
    ];
    for (const [input, why] of bad) expect(() => parseTheme(input), JSON.stringify(input)).toThrow(why);
    expect(() => parseTheme({ colors: { accent: "x" } })).toThrow(ThemeError);
  });

  it("read the same YAML the terminal viewer reads", () => {
    const t = parseTheme(
      parse(`
name: ocean
base: dark
colors:
  accent: "#0af"
  key: "33"
emphasis:
  selection: [reverse]
`),
    );
    const v = themeVariables(t);
    expect(v["--actlet-accent"]).toBe("#00aaff");
    expect(v["--actlet-key"]).toBe("#0087ff");
    // Reverse video: the selected row shows the text's colour, with the background's as its text.
    expect(v["--actlet-selection"]).toBe(cssColor("text", t.colors.text));
    expect(v["--actlet-selection-text"]).toBe(cssColor("background", t.colors.background));
  });
});

describe("colours", () => {
  it("map ANSI numbers to the xterm palette", () => {
    expect([0, 1, 7, 8, 15].map(xtermColor)).toEqual(["#000000", "#cd0000", "#e5e5e5", "#7f7f7f", "#ffffff"]);
    expect([16, 21, 196, 231].map(xtermColor)).toEqual(["#000000", "#0000ff", "#ff0000", "#ffffff"]);
    expect([232, 255].map(xtermColor)).toEqual(["#080808", "#eeeeee"]);
  });

  it("make none the page's own colours", () => {
    expect(cssColor("panel", "none")).toBe("Canvas");
    expect(cssColor("muted", "none")).toBe("CanvasText");
    expect(cssColor("ok", "#ABC")).toBe("#aabbcc");
  });
});

describe("the viewer's theme prop", () => {
  it("names built-in themes, and sets a theme file's properties inline", () => {
    expect(themeLook().name).toBe("auto");
    expect(themeLook("plain")).toEqual({ name: "plain", variables: null, reverseSelection: false, notice: "" });
    const custom = themeLook({ base: "plain", colors: { accent: "#ff0000" } });
    expect(custom.name).toBe("custom");
    expect(custom.variables!["--actlet-accent"]).toBe("#ff0000");
    expect(custom.reverseSelection).toBe(true);
    expect(custom.colorScheme).toBe("light dark");
    expect(themeLook({ base: "light" }).colorScheme).toBe("light");
  });

  it("falls back to dark, saying why", () => {
    expect(themeLook({ colors: { accent: "red" } })).toMatchObject({
      name: "dark",
      variables: null,
      notice: expect.stringMatching(/^theme: colors.accent: "red" isn't a colour.*; using dark$/),
    });
    expect(themeLook("solarized" as never).notice).toMatch(/no theme "solarized"/);
  });
});
