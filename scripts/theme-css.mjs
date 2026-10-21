// Writes the stylesheet's theme blocks from the built-in themes, between
// the "themes" markers in src/styles.css. Dev only: run after changing
// themes/*.yaml and src/view/theme.ts; a test checks they agree.
//
//   node --experimental-strip-types scripts/theme-css.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { BUILTIN_THEMES, colorScheme, themeVariables } from "../src/view/theme.ts";

const block = (selector, theme, indent = "") => {
  const vars = Object.entries(themeVariables(theme)).map(([k, v]) => `${indent}  ${k}: ${v};`);
  return `${indent}${selector} {\n${vars.join("\n")}\n${indent}  color-scheme: ${colorScheme(theme)};\n${indent}}`;
};
/** The theme blocks, as the stylesheet has them. */
export function themeCss() {
  const { dark, light, plain } = BUILTIN_THEMES;
  return [
    "/* themes: written by scripts/theme-css.mjs from the built-in themes. */",
    "",
    "/* dark, the default; auto picks light or plain below when the reader asks for them. */",
    block(
      '.actlet-viewer:not([data-theme]),\n.actlet-viewer[data-theme="dark"],\n.actlet-viewer[data-theme="auto"]',
      dark,
    ),
    "",
    block('.actlet-viewer[data-theme="light"]', light),
    "",
    block('.actlet-viewer[data-theme="plain"]', plain),
    "",
    "@media (prefers-color-scheme: light) {",
    block('.actlet-viewer[data-theme="auto"]', light, "  "),
    "}",
    "",
    "/* Readers who ask for more contrast, or force their own colours, get plain. */",
    "@media (prefers-contrast: more), (forced-colors: active) {",
    block('.actlet-viewer[data-theme="auto"]', plain, "  "),
    "}",
    "",
    "/* end of themes */",
  ].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = new URL("../src/styles.css", import.meta.url);
  const old = readFileSync(file, "utf8");
  const start = old.indexOf("/* themes: written");
  const end = old.indexOf("/* end of themes */") + "/* end of themes */".length;
  const at = start >= 0 ? [start, end] : [old.indexOf("/*THEMES*/"), old.indexOf("/*THEMES*/") + "/*THEMES*/".length];
  writeFileSync(file, old.slice(0, at[0]) + themeCss() + old.slice(at[1]));
}
