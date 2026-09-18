// The Merchant Center feed. What is tested here is what gets an account
// suspended if it drifts: a price that disagrees with the landing page, an item
// advertised out of stock, a range flattened into one item, or a made-up
// identifier.
import { describe, expect, it, vi } from "vitest";
import type { UnleashedMap } from "@/lib/unleashed";

// The snapshot holds one page whose name disagrees with the ERP's, which is the
// case displayName exists for.
vi.mock("@/lib/catalogue", () => ({
  allProducts: () => [],
  variationsFor: () => [],
  productBySlug: (slug: string) =>
    slug === "change-plates"
      ? {
          name: "Fractional Change Plates",
          short_description: "<p>Milled steel change plates for the last 2.5kg of a lift.</p>",
        }
      : undefined,
}));

// Only the slugs under test are advertised, so the fixtures below do not have
// to be kept in step with the real allowlist.
vi.mock("@/lib/merchant-feed-allowlist", () => ({
  FREIGHT_VERIFIED_SLUGS: new Set(["change-plates", "speed-rope", "gone-cold"]),
}));

const { buildFeed, feedToXml, feedTitle, feedPrice } = await import("@/lib/merchant-feed");

const measured = { widthCm: 30, depthCm: 30, heightCm: 12, weightKg: 8 };

const entry = (name: string, over: Record<string, unknown> = {}) => ({
  price: 46,
  stock: 4,
  name,
  brand: "MK",
  group: "Weight Plates",
  sellable: true,
  image: "https://cdn.example/plate.jpg",
  ...measured,
  ...over,
});

const map = (over: Record<string, unknown> = {}): UnleashedMap =>
  ({
    MWWPCP01: entry("Change Plates - 0.5kg", { price: 26 }),
    MWWPCP02: entry("Change Plates - 1kg", { price: 46 }),
    MBSARO01: entry("Speed Rope", { group: "Body Weight", price: 25 }),
    ...over,
  }) as unknown as UnleashedMap;

describe("building the feed", () => {
  it("publishes one item per ERP code, not one per page", () => {
    const { items } = buildFeed(map());
    expect(items.map((i) => i.id)).toEqual(["MBSARO01", "MWWPCP01", "MWWPCP02"]);
  });

  it("prices each size at its own price, GST inclusive", () => {
    const { items } = buildFeed(map());
    const byId = Object.fromEntries(items.map((i) => [i.id, i.price]));
    // The range's two sizes cost different amounts. Publishing both at the
    // cheapest — which is what ErpUnit.price holds — is the price mismatch that
    // gets items disapproved against their own landing page.
    expect(byId.MWWPCP01).toBe("26.00 AUD");
    expect(byId.MWWPCP02).toBe("46.00 AUD");
  });

  it("ties a range together with item_group_id and leaves a single product alone", () => {
    const { items } = buildFeed(map());
    const plates = items.filter((i) => i.id.startsWith("MWWPCP"));
    expect(new Set(plates.map((i) => i.itemGroupId))).toEqual(new Set(["change-plates"]));
    expect(items.find((i) => i.id === "MBSARO01")?.itemGroupId).toBeUndefined();
  });

  it("never claims a GTIN it does not have", () => {
    const xml = feedToXml(buildFeed(map()).items);
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
    expect(xml).not.toContain("<g:gtin>");
    expect(xml).toContain("<g:mpn>MWWPCP01</g:mpn>");
  });

  it("drops a code that is out of stock", () => {
    const { items, rejected } = buildFeed(map({ MWWPCP02: entry("Change Plates - 1kg", { stock: 0 }) }));
    expect(items.map((i) => i.id)).not.toContain("MWWPCP02");
    expect(rejected).toContainEqual({ code: "MWWPCP02", unit: "change-plates", reason: "out of stock" });
  });

  it("drops a code with no price rather than advertising it at zero", () => {
    const { items, rejected } = buildFeed(map({ MWWPCP02: entry("Change Plates - 1kg", { price: 0 }) }));
    expect(items.map((i) => i.id)).not.toContain("MWWPCP02");
    expect(rejected).toContainEqual({ code: "MWWPCP02", unit: "change-plates", reason: "no price" });
  });

  it("drops a code whose freight cannot be quoted", () => {
    const unmeasured = entry("Change Plates - 1kg", { widthCm: undefined, depthCm: undefined, heightCm: undefined });
    const { items } = buildFeed(map({ MWWPCP02: unmeasured }));
    // It would reach checkout and stop there, so it must not be a landing page
    // for a paid click.
    expect(items.map((i) => i.id)).not.toContain("MWWPCP02");
  });

  it("publishes everything eligible, because a free listing costs nothing", () => {
    // Narrowing the FEED does not control spend — a campaign does. What the
    // feed must do is carry the distinction, so a paid campaign can filter on it
    // later without a redeploy.
    const { items } = buildFeed(map({ MZZUNK01: entry("Unvetted Thing", { group: "Cardio" }) }));
    expect(items.map((i) => i.id)).toContain("MZZUNK01");
  });

  it("tags the freight-verified so a campaign can bid on only those", () => {
    const { items } = buildFeed(map({ MZZUNK01: entry("Unvetted Thing", { group: "Cardio" }) }));
    const label = Object.fromEntries(items.map((i) => [i.id, i.customLabel0]));
    expect(label.MWWPCP01).toBe("freight-verified");
    expect(label.MZZUNK01).toBe("unverified");
  });

  it("narrows to the verified set only when explicitly asked", () => {
    const { items } = buildFeed(map({ MZZUNK01: entry("Unvetted Thing", { group: "Cardio" }) }), {
      verifiedOnly: true,
    });
    expect(items.map((i) => i.id)).not.toContain("MZZUNK01");
    expect(items.map((i) => i.id)).toContain("MWWPCP01");
  });

  it("puts the label in the XML where Merchant Center reads it", () => {
    const xml = feedToXml(buildFeed(map()).items);
    expect(xml).toContain("<g:custom_label_0>freight-verified</g:custom_label_0>");
  });
});

describe("descriptions", () => {
  // The bug this pins: the feed read product-copy.json only, so 118 of 127
  // items advertised "Buy X at MASTERKRAFT. $20.00 inc. GST." while their own
  // landing page served real copy from the WooCommerce snapshot.
  const withPage = (over = {}) =>
    map({ MWWPCP01: { ...entry("Change Plates - 0.5kg", { price: 26 }), ...over } });

  it("uses the snapshot's copy rather than the generated string", () => {
    const { items } = buildFeed(withPage());
    const d = items.find((i) => i.id === "MWWPCP01")!.description;
    expect(d).toBe("Milled steel change plates for the last 2.5kg of a lift.");
    expect(d).not.toMatch(/^Buy /);
  });

  it("strips the snapshot's HTML, which Merchant Center rejects", () => {
    const { items } = buildFeed(withPage());
    expect(items.find((i) => i.id === "MWWPCP01")!.description).not.toMatch(/[<>]/);
  });

  it("lets an editor's database row win over the snapshot", () => {
    const { items } = buildFeed(withPage(), {
      content: { "change-plates": { short: "The edited sentence." } },
    });
    expect(items.find((i) => i.id === "MWWPCP01")!.description).toBe("The edited sentence.");
  });

  it("falls back to the generated string only when nothing else exists", () => {
    // MBSARO01's slug has no snapshot page in the mock and no JSON entry.
    const { items } = buildFeed(map());
    expect(items.find((i) => i.id === "MBSARO01")!.description).toMatch(/^Buy .* at MASTERKRAFT\./);
  });
});

describe("titles", () => {
  const unit = { brand: "MK", name: "Change Plates", slug: "change-plates" } as never;

  it("reads the way a shopper types: brand, product, size", () => {
    expect(feedTitle(unit, "1kg")).toBe("MasterKraft Change Plates 1kg");
  });

  it("uses the name the landing page shows, not the ERP's", () => {
    // The page renders the snapshot's product when there is one, so a feed that
    // advertises the ERP's name sends the shopper somewhere that looks like a
    // different product. The real case is MBRPMI01: "Mini Bands" in the ERP,
    // "Micro Bands (Pack of 4)" on the page.
    const withPage = { ...(unit as object), wooSlug: "change-plates" } as never;
    expect(feedTitle(withPage, "1kg")).toBe("MasterKraft Fractional Change Plates 1kg");
  });

  it("keeps the size when the name has to be trimmed", () => {
    const long = { brand: "MK", name: "X".repeat(200), slug: "x" } as never;
    const title = feedTitle(long, "25kg");
    expect(title.length).toBeLessThanOrEqual(150);
    expect(title.endsWith("25kg")).toBe(true);
  });
});

describe("serialising", () => {
  it("escapes a name that would otherwise break the document", () => {
    const xml = feedToXml([
      {
        id: "M1",
        title: 'Rope & Band Rack <"small">',
        description: "x",
        link: "https://masterkraft.com/product/x",
        imageLink: "https://cdn.example/x.jpg",
        price: feedPrice(60),
        mpn: "M1",
        availability: "in_stock",
        condition: "new",
        googleProductCategory: "Sporting Goods > Exercise & Fitness",
        productType: "Equipment Storage",
        customLabel0: "freight-verified",
      },
    ]);
    expect(xml).toContain("Rope &amp; Band Rack &lt;&quot;small&quot;&gt;");
    expect(xml).not.toContain('<"small">');
  });
});
