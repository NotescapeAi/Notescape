import js from "@eslint/js";

export default [
  js.configs.recommended,           // ESLint's recommended rules
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      // add custom rule tweaks here
    },
    ignores: ["dist/**", "node_modules/**"]
  }
];
