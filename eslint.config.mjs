import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    // Custom ignores migrated from legacy .eslintignore:
    "server.js",
    "lib/proxy-manager.cjs",
    "lib/proxy-manager.js",
    "lib/auth/user-storage-init.cjs",
    "lib/auth/user-storage-mongo-init.cjs",
    "lib/vendor/**",
    "*.config.js",
  ]),
  {
    files: ["**/*.cjs", "scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
]);

export default eslintConfig;
