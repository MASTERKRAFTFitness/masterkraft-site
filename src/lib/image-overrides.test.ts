import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import erpOverrides from "@/lib/erp-image-overrides.json";
import productOverrides from "@/lib/product-image-overrides.json";

// The two backdrop-repaint maps, from scripts/normalize-erp-bg.py and
// scripts/normalize-product-bg.py. Each map and the /public files it points at
// are committed SEPARATELY, so the failure worth guarding is a half-committed
// run: a map entry whose file was never added shows a broken image where a
// product photo should be, and reads as an outage rather than a missing commit.
const erp = erpOverrides as Record<string, string>;
const product = productOverrides as Record<string, string[]>;
const PUBLIC = join(process.cwd(), "public");

describe("ERP image overrides", () => {
  it("is keyed by UPPERCASE product code, which is how the ERP map is keyed", () => {
    // A lowercase key is silently dead: buildMap looks the override up by
    // ProductCode.toUpperCase(), so it would never match, and the white
    // backdrop would ship with nothing to show that the entry was ignored.
    expect(Object.keys(erp).filter((k) => k !== k.toUpperCase())).toEqual([]);
  });

  it("points every code at a committed file under /public/erp-bg", () => {
    const missing = Object.entries(erp)
      .filter(([, p]) => !p.startsWith("/erp-bg/") || !existsSync(join(PUBLIC, p)))
      .map(([code]) => code);
    expect(missing).toEqual([]);
  });
});

describe("WooCommerce image overrides", () => {
  it("points every path at a committed file under /public", () => {
    const missing = Object.entries(product)
      .flatMap(([sku, paths]) => paths.map((p) => [sku, p] as const))
      .filter(([, p]) => !existsSync(join(PUBLIC, p)))
      .map(([sku, p]) => `${sku} -> ${p}`);
    expect(missing).toEqual([]);
  });

  // THE MIRROR'S WORK LIVES IN THIS MAP TOO. scripts/mirror-product-images.mjs
  // wrote ~870 /product-images paths here to get the catalogue off the WordPress
  // host before the domain cutover, and normalize-product-bg.py writes
  // /product-bg paths into the same file. A writer that saves the map wholesale
  // instead of merging silently deletes the other's entries, which would send
  // hundreds of products back to masterkraft.com/wp-content — a host that has
  // answered 404 since the cutover. A collapse to near-zero is the symptom.
  it("still carries the mirrored /product-images entries", () => {
    const mirrored = Object.values(product).filter((paths) =>
      paths.some((p) => p.startsWith("/product-images/")),
    );
    expect(mirrored.length).toBeGreaterThan(250);
  });

  it("never mixes mirrored and repainted paths within one product", () => {
    // The gallery is replaced as a unit, so a half-repainted array would show
    // the repainted shots beside the off-shade ones it was meant to replace.
    const mixed = Object.entries(product)
      .filter(([, paths]) => {
        const dirs = new Set(paths.map((p) => p.split("/")[1]));
        return dirs.size > 1;
      })
      .map(([sku]) => sku);
    expect(mixed).toEqual([]);
  });
});
