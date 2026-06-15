import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["web/**", "node_modules/**", "dist/**"]
  }
});
