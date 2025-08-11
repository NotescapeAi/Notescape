module.exports = {
  env: { browser: true, es2022: true, node: true },
  extends: ["eslint:recommended"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  rules: {},
  ignorePatterns: ["dist/", "node_modules/"]
};
