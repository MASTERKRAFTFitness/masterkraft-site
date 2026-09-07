// The WordPress -> Unleashed image swap. Offline: a FIXTURE ERP map, the same
// shape ranges.test.ts uses, so these assert the rule rather than the catalogue.
//
// The rule has one job and one guard. The job is that no surface rendering a
// snapshot product emits a wp-content URL when the ERP has a photograph. The
// guard is that a product the ERP has NO photograph of keeps the one it has —
// 26 live products are in that state and a blank tile is worse than an
// off-shade backdrop. See withErpImages.
import { describe, expect, it } from "vitest";
import { withErpImages } from "@/lib/unleashed";
import type { UnleashedMap } from "@/lib/unleashed";
import type { WcProduct } from "@/lib/woocommerce";

const WOO = "https://masterkraft.com/wp-content/uploads/2023/11/MMDBRH01-1S.jpg";
const WOO2 = "https://masterkraft.com/wp-content/uploads/2023/11/MMDBRH01-2S.jpg";

const product = (sku: string, images: string[] = [WOO]): WcProduct =>
  ({
    id: 1,
    sku,
    name: sku,
    slug: sku,
    images: images.map((src) => ({ src, alt: sku })),
  }) as WcProduct;

function erp(rows: [code: string, name: string, image?: string][]): UnleashedMap {
  const map: UnleashedMap = {};
  for (const [code, name, image] of rows) {
    map[code] = { price: 10, stock: 1, name, image, brand: "MK", sellable: true };
  }
  return map;
}

describe("withErpImages", () => {
  it("replaces the WordPress URL with the ERP photograph", () => {
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"]]);
    const out = withErpImages(product("MMDBRH01"), map);
    expect(out.images.map((i) => i.src)).toEqual(["erp/1kg.jpg"]);
  });

  it("resolves through the alias map, like lookupBySku", () => {
    // SBBSCU01 is a store SKU for the ERP's MBBSCU01 (unleashed-aliases.ts).
    const map = erp([["MBBSCU01", "Curl Bar", "erp/curl.jpg"]]);
    expect(withErpImages(product("SBBSCU01"), map).images[0].src).toBe("erp/curl.jpg");
  });

  it("resolves a -GROUP container through its range, in picker order", () => {
    // A `-GROUP` SKU is a WooCommerce bundle container and is not an ERP code,
    // so the range is the only thing that answers for it. One parent photograph
    // becomes one per size, which is what the gallery strip captions.
    const map = erp([
      ["MMDBRH03", "Rubber Hex Dumbbell - 2.5kg", "erp/2.5kg.jpg"],
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"],
    ]);
    const out = withErpImages(product("MMDBRH-GROUP"), map);
    expect(out.images.map((i) => i.src)).toEqual(["erp/1kg.jpg", "erp/2.5kg.jpg"]);
  });

  it("gives a single SIZE its own photograph and not its siblings'", () => {
    // stemOf only strips `-GROUP`/`-1`, so `MMDBRH03` stems to itself and
    // getRange finds one member — "not a range, just a product". That is the
    // right answer here: a page for one size shows that size.
    const map = erp([
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"],
      ["MMDBRH03", "Rubber Hex Dumbbell - 2.5kg", "erp/2.5kg.jpg"],
    ]);
    const out = withErpImages(product("MMDBRH03"), map);
    expect(out.images.map((i) => i.src)).toEqual(["erp/2.5kg.jpg"]);
  });

  it("puts the container's own code first, then the rest of its sizes", () => {
    // The hidden variable twin `MMDBRH` IS an ERP code as well as a stem, so
    // both paths answer and the product's own photograph leads.
    const map = erp([
      ["MMDBRH", "Rubber Hex Dumbbell", "erp/parent.jpg"],
      ["MMDBRH03", "Rubber Hex Dumbbell - 2.5kg", "erp/2.5kg.jpg"],
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"],
    ]);
    const out = withErpImages(product("MMDBRH"), map);
    expect(out.images.map((i) => i.src)).toEqual([
      "erp/parent.jpg",
      "erp/1kg.jpg",
      "erp/2.5kg.jpg",
    ]);
  });

  it("KEEPS the WordPress image when the ERP has no photograph", () => {
    // The 26 live products in this state, mostly SNAP twins of MK ranges. A
    // blanket swap would leave their pages with no picture at all.
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", undefined]]);
    const out = withErpImages(product("MMDBRH01", [WOO, WOO2]), map);
    expect(out.images.map((i) => i.src)).toEqual([WOO, WOO2]);
  });

  it("keeps it when the code is not in the ERP at all", () => {
    expect(withErpImages(product("SWWPOPR"), {}).images[0].src).toBe(WOO);
  });

  it("replaces the /product-bg repaints too — they are the same photograph", () => {
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"]]);
    const out = withErpImages(product("MMDBRH01", ["/product-bg/MMDBRH01.jpg"]), map);
    expect(out.images.map((i) => i.src)).toEqual(["erp/1kg.jpg"]);
  });

  it("replaces the /product-images mirror too — rehosting is not rephotographing", () => {
    // The mirror moved ~870 photographs off the dead WordPress host and into
    // /public. That fixed WHERE they are served from and nothing about WHOSE
    // picture they are, so the ERP replaces them on the same terms as a
    // wp-content URL. Matching only the host would have let nearly all of the
    // catalogue through — the mirror had already rewritten it.
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"]]);
    const out = withErpImages(product("MMDBRH01", ["/product-images/MMDBRH01-1.jpg"]), map);
    expect(out.images.map((i) => i.src)).toEqual(["erp/1kg.jpg"]);
  });

  it("drops the mirror's SECONDARY shots rather than trailing them behind", () => {
    // The deliberate cost of the full swap: 571 secondary photographs across the
    // mirrored set — detail and angle shots the ERP has no equivalent for — stop
    // being rendered. They are snapshot photography, so they go with the rest;
    // keeping them would mix the ERP's backdrop with the old store's in one
    // gallery, which is the inconsistency this function exists to end.
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"]]);
    const out = withErpImages(
      product("MMDBRH01", [
        "/product-images/MMDBRH01-1.jpg",
        "/product-images/MMDBRH01-2.jpg",
        "/product-images/MMDBRH01-3.jpg",
      ]),
      map
    );
    expect(out.images.map((i) => i.src)).toEqual(["erp/1kg.jpg"]);
  });

  it("KEEPS the mirrored photograph when the ERP has none — the guard still holds", () => {
    // The widened rule must not turn the mirror into a way to lose a picture.
    // A product the ERP has no photograph of keeps what it has, exactly as it
    // does for a wp-content URL; a blank tile is worse than an old backdrop.
    const out = withErpImages(product("SWWPOPR", ["/product-images/SWWPOPR-1.jpg"]), {});
    expect(out.images.map((i) => i.src)).toEqual(["/product-images/SWWPOPR-1.jpg"]);
  });

  it("leaves a product carrying no snapshot photography untouched", () => {
    // An ErpUnit rendered by unitAsProduct already holds an ERP URL. Returning
    // the SAME OBJECT is what lets this be applied at every surface blind.
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"]]);
    const p = product("MMDBRH01", ["erp/1kg.jpg"]);
    expect(withErpImages(p, map)).toBe(p);
  });

  it("keeps a non-WordPress image, behind the ERP's", () => {
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"]]);
    const out = withErpImages(product("MMDBRH01", [WOO, "/hand-added.jpg"]), map);
    expect(out.images.map((i) => i.src)).toEqual(["erp/1kg.jpg", "/hand-added.jpg"]);
  });

  // ------------------------------------------------- the Supabase gallery
  //
  // The third source, for the two things Unleashed structurally cannot hold: a
  // SECOND photograph for a code, and any photograph at all for a `-GROUP`
  // container that is not an ERP code. It never leads over the ERP's own.

  it("puts the gallery BEHIND the ERP's photograph, never in front", () => {
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"]]);
    const out = withErpImages(product("MMDBRH01", [WOO]), map, {
      MMDBRH01: ["/product-bg/MMDBRH01-2.jpg"],
    });
    expect(out.images.map((i) => i.src)).toEqual(["erp/1kg.jpg", "/product-bg/MMDBRH01-2.jpg"]);
  });

  it("gives a -GROUP container a picture when the ERP has none — the whole point", () => {
    // MBASADJ-GROUP is a WooCommerce bundle container. It is not an Unleashed
    // ProductCode, so no upload can ever give it a photograph; without this it
    // keeps its WordPress one forever.
    const out = withErpImages(product("MBASADJ-GROUP", [WOO]), {}, {
      "MBASADJ-GROUP": ["/product-images/MBASADJ-1.jpg"],
    });
    expect(out.images.map((i) => i.src)).toEqual(["/product-images/MBASADJ-1.jpg"]);
  });

  it("still keeps the snapshot photograph when neither source has anything", () => {
    // The original guard, unchanged by the third source.
    expect(withErpImages(product("SWWPOPR"), {}, {}).images[0].src).toBe(WOO);
  });

  it("does not show one photograph twice when the gallery repeats the ERP's", () => {
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"]]);
    const out = withErpImages(product("MMDBRH01", [WOO]), map, {
      MMDBRH01: ["erp/1kg.jpg", "/product-bg/MMDBRH01-2.jpg"],
    });
    expect(out.images.map((i) => i.src)).toEqual(["erp/1kg.jpg", "/product-bg/MMDBRH01-2.jpg"]);
  });

  it("resolves the gallery through the alias map, like the price does", () => {
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"]]);
    const out = withErpImages(product("SCRWAR04", [WOO]), map, {
      C2ROWERG: ["/product-bg/C2ROWERG-2.jpg"],
    });
    expect(out.images.some((i) => i.src === "/product-bg/C2ROWERG-2.jpg")).toBe(true);
  });

  it("adds angles to an ERP-sourced product that carries no snapshot photography", () => {
    // An ErpUnit from unitAsProduct never had a WordPress URL, so the swap has
    // nothing to do — but it can still gain a second angle.
    const p = product("MMDBRH01", ["erp/1kg.jpg"]);
    const out = withErpImages(p, {}, { MMDBRH01: ["/product-bg/MMDBRH01-2.jpg"] });
    expect(out.images.map((i) => i.src)).toEqual(["erp/1kg.jpg", "/product-bg/MMDBRH01-2.jpg"]);
  });

  it("returns the SAME OBJECT when the gallery adds nothing to such a product", () => {
    const p = product("MMDBRH01", ["erp/1kg.jpg"]);
    expect(withErpImages(p, {}, {})).toBe(p);
    expect(withErpImages(p, {}, { MMDBRH01: ["erp/1kg.jpg"] })).toBe(p);
  });

  it("never emits a wp-content URL once the ERP has answered", () => {
    const map = erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", "erp/1kg.jpg"]]);
    const out = withErpImages(product("MMDBRH01", [WOO, WOO2]), map);
    expect(out.images.some((i) => i.src.includes("/wp-content/"))).toBe(false);
  });
});
