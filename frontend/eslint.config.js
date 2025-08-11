export default [
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      semi: ["error", "always"],
      quotes: ["error", "double"],
    },
  },
];
