/**
 * Themes in the format Actlet's terminal viewer reads, so that one theme
 * file styles both: colours and emphasis by token, over a built-in base.
 * The implementor parses a theme file (YAML or JSON); the viewer checks it
 * as strictly as the terminal viewer does and turns it into the
 * stylesheet's custom properties.
 */

/** The theme's tokens, in the order Actlet's docs list them. New ones may be added; none are renamed. */
export const THEME_TOKENS = [
  "background",
  "panel",
  "selection",
  "border",
  "text",
  "muted",
  "faint",
  "accent",
  "agent",
  "subagent",
  "operator",
  "ok",
  "error",
  "warning",
  "attach",
  "added",
  "removed",
  "hunk",
  "keyword",
  "string",
  "number",
  "comment",
  "key",
  "function",
  "punctuation",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

/** The emphasis a token's text may have. */
export const THEME_ATTRIBUTES = ["bold", "italic", "underline", "reverse"] as const;

export type ThemeAttribute = (typeof THEME_ATTRIBUTES)[number];

export type BuiltinThemeName = "dark" | "light" | "plain";

/**
 * A theme file as parsed: some tokens' colours and emphasis, over a base.
 * A colour is "#rrggbb", "#rgb", an ANSI colour number from "0" to "255"
 * (a string, as in the terminal viewer's files), or "none" for the
 * browser's own.
 */
export interface ThemeFile {
  name?: string;
  /** The built-in theme it changes: dark unless it says otherwise. */
  base?: BuiltinThemeName;
  colors?: Partial<Record<ThemeToken, string>>;
  /** Replaces the base's emphasis of the tokens it names. */
  emphasis?: Partial<Record<ThemeToken, ThemeAttribute[]>>;
}

/** A complete theme: every token's colour, and emphasis. */
export interface Theme {
  name: string;
  colors: Record<ThemeToken, string>;
  emphasis: Partial<Record<ThemeToken, ThemeAttribute[]>>;
}

/** The built-in themes, the same as Actlet's themes/*.yaml. */
export const BUILTIN_THEMES: Record<BuiltinThemeName, Theme> = {
  dark: {
    name: "dark",
    colors: {
      background: "#17171F",
      panel: "#21212C",
      selection: "#33304A",
      border: "#3A3950",
      text: "#DCDCE6",
      muted: "#9999AF",
      faint: "#5A5A72",
      accent: "#A48BFA",
      agent: "#A48BFA",
      subagent: "#5FB8E6",
      operator: "#F2B65E",
      ok: "#5FD192",
      error: "#F37184",
      warning: "#E9C46A",
      attach: "#F28FB0",
      added: "#5FD192",
      removed: "#F37184",
      hunk: "#5FB8E6",
      keyword: "#C79BF2",
      string: "#A3D982",
      number: "#F5A86E",
      comment: "#87879E",
      key: "#7FAAF7",
      function: "#5ED6E3",
      punctuation: "#8E8EA6",
    },
    emphasis: { accent: ["bold"], comment: ["italic"] },
  },
  light: {
    name: "light",
    colors: {
      background: "#FBFBFD",
      panel: "#EEEFF5",
      selection: "#E6E3FA",
      border: "#CACCDA",
      text: "#2A2C38",
      muted: "#626578",
      faint: "#A2A5B5",
      accent: "#6A45E8",
      agent: "#6A45E8",
      subagent: "#1A6BA7",
      operator: "#A25B0B",
      ok: "#1F7541",
      error: "#BE2E46",
      warning: "#916300",
      attach: "#C2306E",
      added: "#1F7541",
      removed: "#BE2E46",
      hunk: "#1A6BA7",
      keyword: "#7A35D9",
      string: "#2D7B31",
      number: "#B0500B",
      comment: "#696C7F",
      key: "#1D4FD6",
      function: "#0B7488",
      punctuation: "#626578",
    },
    emphasis: { accent: ["bold"], comment: ["italic"] },
  },
  plain: {
    name: "plain",
    colors: Object.fromEntries(THEME_TOKENS.map((t) => [t, "none"])) as Record<ThemeToken, string>,
    emphasis: {
      accent: ["bold"],
      selection: ["reverse"],
      agent: ["bold"],
      subagent: ["bold"],
      operator: ["bold"],
      keyword: ["bold"],
      key: ["underline"],
    },
  },
};

/** A theme that isn't one: an unknown field, token, attribute or base, or a colour that isn't one. */
export class ThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeError";
  }
}

const reColor = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isToken(t: string): t is ThemeToken {
  return (THEME_TOKENS as readonly string[]).includes(t);
}

function quote(s: string): string {
  return JSON.stringify(s.length > 40 ? s.slice(0, 40) + "…" : s);
}

/** A colour as the theme file gives it, checked: "#rrggbb", "#rgb", "0" to "255", or "none". */
function checkColor(token: string, c: unknown): string {
  if (typeof c === "string" && (c === "none" || reColor.test(c))) return c;
  if (typeof c === "string" && /^[+-]?\d+$/.test(c) && Number(c) >= 0 && Number(c) <= 255) return String(Number(c));
  throw new ThemeError(`colors.${token}: ${quote(String(c))} isn't a colour: give #rrggbb, #rgb, 0 to 255 or none`);
}

/**
 * Checks a theme file, parsed from YAML or JSON, and completes it from its
 * base: dark unless it names another built-in theme. It throws a
 * ThemeError for anything the terminal viewer would refuse: unknown
 * fields, tokens, attributes or bases, and colours that aren't ones.
 */
export function parseTheme(input: unknown): Theme {
  if (!isObject(input)) throw new ThemeError("a theme is an object of name, base, colors and emphasis");
  for (const k of Object.keys(input)) {
    if (!["name", "base", "colors", "emphasis"].includes(k)) throw new ThemeError(`unknown field ${quote(k)}`);
  }
  const { name = "", base = "dark", colors = {}, emphasis = {} } = input;
  if (typeof name !== "string") throw new ThemeError("name: give a string");
  if (typeof base !== "string" || !Object.hasOwn(BUILTIN_THEMES, base)) {
    throw new ThemeError(`base ${quote(String(base))} isn't a built-in theme: dark, light or plain`);
  }
  if (!isObject(colors)) throw new ThemeError("colors: give colours by token");
  if (!isObject(emphasis)) throw new ThemeError("emphasis: give attributes by token");
  const from = BUILTIN_THEMES[base as BuiltinThemeName];
  const out: Theme = { name, colors: { ...from.colors }, emphasis: { ...from.emphasis } };
  for (const [token, c] of Object.entries(colors)) {
    if (!isToken(token)) throw new ThemeError(`colors: unknown token ${quote(token)}`);
    out.colors[token] = checkColor(token, c);
  }
  for (const [token, attrs] of Object.entries(emphasis)) {
    if (!isToken(token)) throw new ThemeError(`emphasis: unknown token ${quote(token)}`);
    if (attrs !== null && !Array.isArray(attrs)) throw new ThemeError(`emphasis.${token}: give a list of attributes`);
    for (const a of attrs ?? []) {
      if (!(THEME_ATTRIBUTES as readonly unknown[]).includes(a)) {
        throw new ThemeError(
          `emphasis.${token}: unknown attribute ${quote(String(a))}: use bold, italic, underline or reverse`,
        );
      }
    }
    out.emphasis[token] = [...((attrs ?? []) as ThemeAttribute[])];
  }
  return out;
}

/** The xterm palette's colour for an ANSI colour number from 0 to 255. */
export function xtermColor(n: number): string {
  const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  if (n < 16) {
    const basic = [
      "#000000",
      "#cd0000",
      "#00cd00",
      "#cdcd00",
      "#0000ee",
      "#cd00cd",
      "#00cdcd",
      "#e5e5e5",
      "#7f7f7f",
      "#ff0000",
      "#00ff00",
      "#ffff00",
      "#5c5cff",
      "#ff00ff",
      "#00ffff",
      "#ffffff",
    ];
    return basic[n];
  }
  if (n < 232) {
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    const i = n - 16;
    return hex(level(Math.floor(i / 36)), level(Math.floor(i / 6) % 6), level(i % 6));
  }
  const g = 8 + (n - 232) * 10;
  return hex(g, g, g);
}

/** Backgrounds: "none" is the page's own background; for every other token, its own text colour. */
const backgrounds: readonly ThemeToken[] = ["background", "panel", "selection"];

/** A theme colour as CSS: a hex colour, or a system colour for "none". */
export function cssColor(token: ThemeToken, c: string): string {
  if (c === "none") return backgrounds.includes(token) ? "Canvas" : "CanvasText";
  if (/^\d+$/.test(c)) return xtermColor(Number(c));
  if (c.length === 4)
    return (
      "#" +
      [...c.slice(1)]
        .map((d) => d + d)
        .join("")
        .toLowerCase()
    );
  return c.toLowerCase();
}

/**
 * A theme as the stylesheet's custom properties: --actlet-<token> for
 * each colour, and for emphasis --actlet-<token>-weight, -style and -line
 * (bold, italic, underline). Reverse swaps a token's colour with the
 * background's, as -fg and -bg; for selection, the selected row shows the
 * text's colour as its background (-selection-text is its text).
 */
export function themeVariables(theme: Theme): Record<string, string> {
  const v: Record<string, string> = {};
  const color = (t: ThemeToken) => cssColor(t, theme.colors[t]);
  for (const t of THEME_TOKENS) v[`--actlet-${t}`] = color(t);
  for (const t of THEME_TOKENS) {
    const attrs = theme.emphasis[t] ?? [];
    if (attrs.includes("bold")) v[`--actlet-${t}-weight`] = "700";
    if (attrs.includes("italic")) v[`--actlet-${t}-style`] = "italic";
    if (attrs.includes("underline")) v[`--actlet-${t}-line`] = "underline";
    if (!attrs.includes("reverse")) continue;
    if (t === "selection") {
      v["--actlet-selection"] = color("text");
      v["--actlet-selection-text"] = color("background");
    } else if (!backgrounds.includes(t)) {
      v[`--actlet-${t}-fg`] = color("background");
      v[`--actlet-${t}-bg`] = color(t);
    }
  }
  return v;
}

/** Whether a theme is dark, for the browser's own controls: by its background, or the system's for "none". */
export function colorScheme(theme: Theme): "dark" | "light" | "light dark" {
  const bg = cssColor("background", theme.colors.background);
  if (!bg.startsWith("#")) return "light dark";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? "dark" : "light";
}

/** What the viewer's theme prop takes: a built-in theme's name, "auto" for the reader's setting, or a theme file. */
export type ViewerTheme = "auto" | BuiltinThemeName | ThemeFile;

/** How the viewer applies a theme. */
export interface ThemeLook {
  /** The data-theme attribute: a built-in theme, "auto", or "custom" for a theme file. */
  name: "auto" | BuiltinThemeName | "custom";
  /** A theme file's custom properties, to set inline; null for the stylesheet's own. */
  variables: Record<string, string> | null;
  /** The theme file shows the selection in reverse video. */
  reverseSelection: boolean;
  colorScheme?: string;
  /** Why the theme asked for couldn't be used, so dark is: "" when it could. */
  notice: string;
}

/** How to apply a theme: built-in ones by name, a theme file checked and completed from its base, else dark. */
export function themeLook(theme: ViewerTheme = "auto"): ThemeLook {
  const none = { variables: null, reverseSelection: false, notice: "" };
  if (theme === "auto" || theme === "dark" || theme === "light" || theme === "plain") return { name: theme, ...none };
  try {
    if (typeof theme === "string")
      throw new ThemeError(`no theme ${quote(theme)}: give dark, light, plain, auto or a theme`);
    const t = parseTheme(theme);
    return {
      name: "custom",
      variables: themeVariables(t),
      reverseSelection: (t.emphasis.selection ?? []).includes("reverse"),
      colorScheme: colorScheme(t),
      notice: "",
    };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { name: "dark", ...none, notice: `theme: ${why}; using dark` };
  }
}
