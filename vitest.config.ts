// Vitest config — runs the template engine and golden-fixture tests.
//
// Why this exists: Stage 2C C0 introduces the template engine
// (src/lib/templates/) with golden eval scenarios. This config
// scopes vitest to the lib's __tests__ folders so it doesn't
// confusingly try to test Next.js components or routes.
//
// To run:
//   npm test            (one shot)
//   npm run test:watch  (re-runs on save)

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
