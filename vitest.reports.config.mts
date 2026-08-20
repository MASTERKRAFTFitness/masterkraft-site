import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Separate config for the REPORT GENERATORS in scripts/*.report.ts.
//
// They are shaped as vitest cases so they can import the app's real modules --
// the same visibility rules and the same spec parser the product page uses --
// instead of reimplementing them in a standalone script and drifting from what
// customers actually see. They write files rather than assert, so they are kept
// out of the default `npm test` include, which stays offline and pure.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["scripts/*.report.ts"] },
});
