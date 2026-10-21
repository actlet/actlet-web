import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "demo/dist", "src/gen", "release"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  { files: ["src/**/*.tsx"], ...jsxA11y.flatConfigs.strict },
  {
    files: ["src/**/*.tsx"],
    rules: {
      // The conversation is a scrolling log that keyboard users focus to
      // scroll and to move between its tool calls with arrow keys.
      "jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["log", "region"] }],
      "jsx-a11y/no-noninteractive-element-interactions": [
        "error",
        { handlers: ["onClick", "onMouseDown", "onMouseUp", "onKeyPress", "onKeyUp"] },
      ],
    },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Event content is untrusted: it is only ever rendered as text.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "Never render HTML: event content is untrusted.",
        },
        {
          selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]",
          message: "Never render HTML: event content is untrusted.",
        },
      ],
    },
  },
  prettier,
);
