import js from "@eslint/js";
import typescript from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,
  ...typescript.configs.recommended,
  ...svelte.configs["flat/recommended"],
  prettier,
  ...svelte.configs["flat/prettier"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2017,
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: typescript.parser,
      },
    },
  },
  {
    ignores: [
      ".DS_Store",
      "node_modules",
      "build/**",
      ".svelte-kit/**",
      "package",
      ".env",
      ".env.*",
      "!.env.example",
      "pnpm-lock.yaml",
      "package-lock.json",
      "yarn.lock",
      "vite.config.js.timestamp-*",
      "vite.config.ts.timestamp-*",
      "dist/**",
      "docs/**",
    ],
  },
  {
    rules: {
      // Customize rules
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "svelte/no-at-html-tags": "off",
      "svelte/valid-compile": [
        "error",
        {
          ignoreWarnings: true,
        },
      ],
    },
  },
];
