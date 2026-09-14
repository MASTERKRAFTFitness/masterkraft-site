import { afterEach, describe, expect, it } from "vitest";
import { decodeEntities, filterListable, plainText } from "@/lib/woocommerce";
// Hiding unshippable products, added 2026-09-06. Freight needs a weight and all
// three dimensions; without them the WHOLE cart is unquotable, not just the line.
describe("hiding what cannot be shipped", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const p = (over: Record<string, unknown> = {}) => ({
    sku: "MTEST01",
    weight: "18",
    dimensions: { length: "45", width: "45", height: "37" },
    ...over,
  });

  // The flag is off by default because hiding also removes the quote flow, which
  // is a working sales path for exactly these products.
  it("lists an unmeasured product when the flag is off", () => {
    delete process.env.HIDE_UNSHIPPABLE;
    expect(filterListable([p({ weight: "", dimensions: {} })])).toHaveLength(1);
  });

  it("hides it when the flag is on", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(filterListable([p({ weight: "", dimensions: {} })])).toHaveLength(0);
  });

  it("keeps a fully measured product either way", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(filterListable([p()])).toHaveLength(1);
  });

  // A weight with no carton is not shippable — the C2 rower's case.
  it("hides a product with a weight but no dimensions", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(filterListable([p({ dimensions: {} })])).toHaveLength(0);
  });

  // 2440cm is 24 metres. A number nobody believes is not a measurement.
  it("hides a product whose carton could not be real", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(
      filterListable([p({ dimensions: { length: "2440", width: "610", height: "40" } })])
    ).toHaveLength(0);
  });

  // THE ERP IS THE SECOND SOURCE, because that is how freight resolves a carton
  // and a listing must not be stricter than the checkout. ABPBSB04 is the real
  // case: the snapshot records the 12" foam plyo box as 850 x 1000 x 305 -
  // millimetres in a centimetre file, so 259 cubic metres - while Unleashed
  // holds the same box at 85 x 100 x 30.5. It was off every listing for it.
  it("keeps a product the ERP has a carton for, when the snapshot's is impossible", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(
      filterListable([
        p({ sku: "ABPBSB04", weight: "13", dimensions: { length: "850", width: "1000", height: "305" } }),
      ])
    ).toHaveLength(1);
  });

  it("still hides an impossible carton when the ERP has nothing either", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(
      filterListable([
        p({ sku: "NOSUCHCODE01", dimensions: { length: "850", width: "1000", height: "305" } }),
      ])
    ).toHaveLength(0);
  });

  // A CONTAINER HAS NO CARTON OF ITS OWN. MMKBPGC-GROUP is the Competition
  // Kettlebells page: a `bundle` holding no variations, whose twelve sizes live
  // on the hidden `variable` twin MMKBPGC and every one of which is measured.
  // Judged on itself it has no weight and no dimensions, and it was hidden.
  it("judges a -GROUP container by the sizes on its hidden twin", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(
      filterListable([{ sku: "MMKBPGC-GROUP", id: 406406, weight: "", dimensions: {} }])
    ).toHaveLength(1);
  });

  // The branch must not become a way for an ordinary unmeasured product to pass:
  // it opens only when the container actually has sizes, and closes again when
  // none of them is measured either.
  it("hides a container none of whose sizes is measured", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    // 403703 is AMDBRH, a `variable` product with 21 sizes and not a carton
    // among them - so the branch opens and then rejects, which is the point.
    expect(filterListable([{ sku: "AMDBRH", id: 403703, weight: "11", dimensions: {} }])).toHaveLength(0);
  });
});

// Entities in the product copy, added 2026-09-11. 163 of the snapshot's 512
// descriptions carry at least one; before plainText existed they reached
// production intact inside meta descriptions and Product JSON-LD.
describe("decoding WooCommerce copy", () => {
  // These four are what the site already renders, so they are pinned: the
  // generic numeric pass added alongside them must not re-typeset the names.
  it("keeps the existing mappings exactly", () => {
    expect(decodeEntities("Chest &amp; Shoulder")).toBe("Chest & Shoulder");
    expect(decodeEntities("a &#8211; b")).toBe("a - b");
    expect(decodeEntities("it&#8217;s")).toBe("it's");
    expect(decodeEntities("6&nbsp;kg")).toBe("6 kg");
  });

  // The three the hand-written list missed. &#8243; is the inch mark and turns
  // up in dimensions, which is exactly the copy a search result shows.
  it("decodes numeric entities that were never on the list", () => {
    expect(decodeEntities("7&#8243; shorts")).toBe("7\u2033 shorts");
    expect(decodeEntities("rigs &#038; racks")).toBe("rigs & racks");
    expect(decodeEntities("and more&#8230;")).toBe("and more\u2026");
    expect(decodeEntities("&#x27;quoted&#x27;")).toBe("'quoted'");
  });

  // Decoding &amp; last is what keeps an already-encoded entity literal instead
  // of resolving it a second time.
  it("does not decode a double-encoded entity twice", () => {
    expect(decodeEntities("a &amp;#8211; b")).toBe("a &#8211; b");
  });

  it("strips tags, decodes, and collapses the whitespace left behind", () => {
    expect(plainText("<p>Dual Pipe &#8211; the\n  versatile</p>\n<p>solution</p>")).toBe(
      "Dual Pipe - the versatile solution"
    );
  });

  // Stripping before decoding, so encoded markup in the copy stays text.
  it("does not turn encoded markup into tags it then strips", () => {
    expect(plainText("a &lt;b&gt;bold&lt;/b&gt; claim")).toBe("a <b>bold</b> claim");
  });

  it("is empty for missing copy, so the caller's fallback still fires", () => {
    expect(plainText(undefined)).toBe("");
    expect(plainText("<p></p>")).toBe("");
  });
});
