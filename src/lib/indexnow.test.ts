import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INDEXNOW_KEY, indexNowEnabled } from "./indexnow";

describe("IndexNow", () => {
  it("serves the key at /<key>.txt, as the protocol requires", () => {
    const file = readFileSync(join(process.cwd(), "public", `${INDEXNOW_KEY}.txt`), "utf8");
    expect(file.trim()).toBe(INDEXNOW_KEY);
  });

  it("uses the same key in the bulk-submit script", () => {
    const script = readFileSync(join(process.cwd(), "scripts", "indexnow-submit.mjs"), "utf8");
    expect(script).toContain(`const KEY = "${INDEXNOW_KEY}"`);
  });

  it("never sends from a preview or a laptop", () => {
    expect(indexNowEnabled({ VERCEL_ENV: "preview" })).toBe(false);
    expect(indexNowEnabled({})).toBe(false);
  });
});
