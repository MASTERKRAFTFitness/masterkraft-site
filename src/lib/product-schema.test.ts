// A range's structured data. What matters is that each size Google crawls
// matches the item the Merchant feed sent for it: same code, price and URL.
import { describe, expect, it } from "vitest";
import { productGroupSchema, offerAvailability } from "@/lib/product-schema";
import { SITE_URL } from "@/lib/site";

const base = {
  slug: "premium-rubber-hex-dumbbell-3",
  name: "Premium Rubber Hex Dumbbell",
  images: ["https://cdn.example/hex.jpg"],
  brand: "MasterKraft",
  priceValidUntil: "2027-10-28",
  returnPolicy: { "@type": "MerchantReturnPolicy" },
};

describe("productGroupSchema", () => {
  const schema = productGroupSchema({
    ...base,
    variants: [
      { code: "MMDBPRH05", label: "4kg", priceValue: 20, inStock: true, image: "https://cdn.example/4.jpg" },
      { code: "MMDBPRH24", label: "40kg", priceValue: 225, inStock: false },
      { code: "MMDBPRH99", label: "50kg", priceValue: 0, inStock: false },
    ],
  }) as {
    "@type": string;
    productGroupID: string;
    variesBy: string;
    offers?: unknown;
    hasVariant: { sku: string; image: string[]; offers: { availability: string } }[];
  };

  it("is a ProductGroup keyed by the unit slug", () => {
    expect(schema["@type"]).toBe("ProductGroup");
    expect(schema.productGroupID).toBe("premium-rubber-hex-dumbbell-3");
    expect(schema.variesBy).toBe("https://schema.org/size");
    expect(schema.offers).toBeUndefined();
  });

  it("gives each priced size its own code, price and ?size= URL", () => {
    const [four, forty] = schema.hasVariant;
    expect(four).toMatchObject({ sku: "MMDBPRH05", size: "4kg", name: "Premium Rubber Hex Dumbbell 4kg", image: ["https://cdn.example/4.jpg"] });
    expect(four.offers).toMatchObject({
      price: "20.00",
      url: `${SITE_URL}/product/premium-rubber-hex-dumbbell-3?size=MMDBPRH05`,
      availability: "https://schema.org/InStock",
    });
    expect(forty.offers.availability).toBe("https://schema.org/BackOrder");
    expect(forty.image).toEqual(["https://cdn.example/hex.jpg"]);
  });

  it("leaves out a size with no price, which cannot carry an Offer", () => {
    expect(schema.hasVariant.map((v) => v.sku)).toEqual(["MMDBPRH05", "MMDBPRH24"]);
  });

  it("is null when no size has a price", () => {
    expect(productGroupSchema({ ...base, variants: [{ code: "X", label: "1", priceValue: 0, inStock: true }] })).toBeNull();
  });
});

describe("offerAvailability", () => {
  it("says BackOrder, matching the feed, for anything not in Melbourne", () => {
    expect(offerAvailability(false)).toBe("https://schema.org/BackOrder");
  });
});
