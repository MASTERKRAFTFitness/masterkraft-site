import { describe, it, expect } from "vitest";
import { parseSpecBlob, isBrandSku, parseProductDetail, type WcProduct, normalizeSpecUnits } from "@/lib/woocommerce";

// The real markup shape used across the catalogue (78 products carry only this
// blob, so a regression here empties their whole spec table).
const PLYO_BOX = `<p class="ai-optimize-32"><strong>Assembled Size</strong></p>

<ul>
 	<li class="ai-optimize-33">Width: 610mm</li>
 	<li class="ai-optimize-34">Depth: 510mm</li>
 	<li class="ai-optimize-35">Height: 750mm</li>
</ul>
<ul>
 	<li class="ai-optimize-36">Colour: Black</li>
 	<li class="ai-optimize-37">Material: Hard wearing vinyl cover</li>
 	<li class="ai-optimize-38">Warranty: 12months</li>
 	<li class="ai-optimize-39">Net Weight: 34kg</li>
 	<li class="ai-optimize-40">Gross Weight: 35kg</li>
</ul>`;

describe("parseSpecBlob", () => {
  it("pulls dimensions out, stripping the per-value mm", () => {
    const { dims } = parseSpecBlob(PLYO_BOX);
    expect(dims).toEqual({ l: "", w: "610", h: "750", d: "510" });
  });

  it("maps the labelled rows", () => {
    const { rows } = parseSpecBlob(PLYO_BOX);
    expect(rows).toEqual([
      { label: "Colour", value: "Black" },
      { label: "Material", value: "Hard wearing vinyl cover" },
      { label: "Warranty", value: "12 months" },
      { label: "Net weight", value: "34 kg" },
      { label: "Gross weight", value: "35 kg" },
    ]);
  });

  it("is inert on empty or unstructured input", () => {
    expect(parseSpecBlob("")).toEqual({ dims: { l: "", w: "", h: "", d: "" }, rows: [] });
    expect(parseSpecBlob("<p>no list here</p>").rows).toEqual([]);
  });
});

const product = (meta: { key: string; value: unknown }[]): WcProduct =>
  ({ meta_data: meta }) as WcProduct;

describe("parseProductDetail spec fallback", () => {
  it("renders a spec table from the blob alone", () => {
    const { specs } = parseProductDetail(
      product([{ key: "specification_text", value: PLYO_BOX }]),
    );
    expect(specs).toEqual([
      { label: "Assembled size", value: "W 610 × H 750 × D 510 mm" },
      { label: "Colour", value: "Black" },
      { label: "Material", value: "Hard wearing vinyl cover" },
      { label: "Net weight", value: "34 kg" },
      { label: "Gross weight", value: "35 kg" },
      { label: "Warranty", value: "12 months" },
    ]);
  });

  it("prefers the discrete ACF fields over the blob, with no duplicate rows", () => {
    const { specs } = parseProductDetail(
      product([
        { key: "specification_text", value: PLYO_BOX },
        { key: "colour", value: "Charcoal" },
        { key: "net_weight", value: "40" },
      ]),
    );
    expect(specs.filter((s) => s.label === "Colour")).toEqual([
      { label: "Colour", value: "Charcoal" },
    ]);
    expect(specs.filter((s) => s.label === "Net weight")).toEqual([
      { label: "Net weight", value: "40 kg" },
    ]);
    // Untouched fields still come from the blob.
    expect(specs).toContainEqual({ label: "Material", value: "Hard wearing vinyl cover" });
  });

  it("stays empty when the product has neither source", () => {
    expect(parseProductDetail(product([])).specs).toEqual([]);
  });
});

// The discrete ACF fields hold a quantity and leave the unit to whoever renders
// it: every net/gross weight in the snapshot is a bare number, and so are 120
// warranties. The blob names its unit, so the same fact used to render two ways
// depending on which source answered — "10kg" here, "414 kg" there, and a bare
// "12" where the twin product read "12 months".
describe("the unit a field's bare numbers are counted in", () => {
  const specOf = (meta: { key: string; value: unknown }[], label: string) =>
    parseProductDetail(product(meta)).specs.find((s) => s.label === label)?.value;

  it("gives a discrete weight the same spacing the blob already had", () => {
    expect(specOf([{ key: "net_weight", value: "10" }], "Net weight")).toBe("10 kg");
    expect(specOf([{ key: "gross_weight", value: "414" }], "Gross weight")).toBe("414 kg");
    expect(specOf([{ key: "net_weight", value: "27.5" }], "Net weight")).toBe("27.5 kg");
  });

  // SEWMBB02 against SEWMBB01: the same wall-mounted rack, one bare, one not.
  it("names the months a bare warranty is counting", () => {
    expect(specOf([{ key: "warranty", value: "12" }], "Warranty")).toBe("12 months");
  });

  it("leaves a value that already names its unit alone", () => {
    expect(specOf([{ key: "warranty", value: "12 months" }], "Warranty")).toBe("12 months");
    expect(specOf([{ key: "net_weight", value: "34kg" }], "Net weight")).toBe("34 kg");
  });

  // A warranty stating what it covers is not a quantity, and "5 Years Frame, 2
  // Years Non-Wearable Parts months" would be worse than the inconsistency.
  it("never appends a unit to prose", () => {
    const prose = "5 Years Frame, 2 Years Non-Wearable Parts";
    expect(specOf([{ key: "warranty", value: prose }], "Warranty")).toBe(prose);
    expect(specOf([{ key: "gross_weight", value: "various" }], "Gross weight")).toBe("various");
    expect(specOf([{ key: "net_weight", value: "10-50 kg" }], "Net weight")).toBe("10-50 kg");
  });

  // Dimensions carry their own "mm" and are assembled, not stated.
  it("leaves a field that has no unit of its own untouched", () => {
    expect(specOf([{ key: "assembled_size_length", value: "2,070" }], "Assembled size")).toBe(
      "L 2,070 mm"
    );
    expect(specOf([{ key: "colour", value: "Black" }], "Colour")).toBe("Black");
  });
});

describe("isBrandSku", () => {
  it("accepts MasterKraft's own M/N SKUs", () => {
    expect(isBrandSku("MBPB3I101")).toBe(true);
    expect(isBrandSku("NX1234")).toBe(true);
  });

  it("accepts the Concept2 (C2) range, which uses an SC prefix", () => {
    expect(isBrandSku("SCRWAR04")).toBe(true); // C2 Rower Model D PM5
    expect(isBrandSku("SCSTAR03")).toBe(true); // C2 Ski Erg PM5
    expect(isBrandSku("SCSTACC04")).toBe(true); // C2 Ski Erg Floor Stand
  });

  it("still hides the other brands in the store", () => {
    expect(isBrandSku("SEQWER01")).toBe(false); // other "S" lines
    expect(isBrandSku("RW1234")).toBe(false); // REVL
    expect(isBrandSku("AB1234")).toBe(false); // clearance
    expect(isBrandSku("")).toBe(false);
    expect(isBrandSku(undefined)).toBe(false);
  });
});

describe("normalizeSpecUnits", () => {
  it("inserts the missing space the blob omits", () => {
    expect(normalizeSpecUnits("34kg")).toBe("34 kg");
    expect(normalizeSpecUnits("12months")).toBe("12 months");
  });

  // The blob template appends "months" whether or not the value is in months, so
  // a warranty phrased differently gets one glued to its last word.
  it("strips a unit glued to a word", () => {
    expect(normalizeSpecUnits("5 Years Frame, 2 Years Non-Wearable Partsmonths")).toBe(
      "5 Years Frame, 2 Years Non-Wearable Parts"
    );
  });

  it("never touches a correctly written value", () => {
    expect(normalizeSpecUnits("(4) Cables- 6 months")).toBe("(4) Cables- 6 months");
    expect(normalizeSpecUnits("3 months")).toBe("3 months");
    expect(normalizeSpecUnits("2 Years Non-Wearable Parts")).toBe("2 Years Non-Wearable Parts");
  });

  // Hand-typed in WordPress. Visible on the 34kg plyo box and the Functional
  // Trainer; three more carry it behind a correct discrete warranty field.
  it("collapses a doubled unit", () => {
    expect(normalizeSpecUnits("Internal Frame: 12 months, Cover: 3 monthsmonths")).toBe(
      "Internal Frame: 12 months, Cover: 3 months"
    );
    expect(normalizeSpecUnits("Hardware, plastics- 3 monthsmonths")).toBe(
      "Hardware, plastics- 3 months"
    );
  });

  it("leaves correct values alone", () => {
    expect(normalizeSpecUnits("5 years")).toBe("5 years");
    expect(normalizeSpecUnits("(4) Cables- 6 months")).toBe("(4) Cables- 6 months");
  });

  // The unit is only ever appended to a value that is nothing but a number.
  it("names the unit of a bare number, and only of a bare number", () => {
    expect(normalizeSpecUnits("34", "kg")).toBe("34 kg");
    expect(normalizeSpecUnits("1,200.5", "kg")).toBe("1,200.5 kg");
    expect(normalizeSpecUnits("12", "months")).toBe("12 months");
    expect(normalizeSpecUnits("12 months", "months")).toBe("12 months");
    expect(normalizeSpecUnits("12months", "months")).toBe("12 months");
    expect(normalizeSpecUnits("10-50 kg", "kg")).toBe("10-50 kg");
    expect(normalizeSpecUnits("various", "kg")).toBe("various");
    expect(normalizeSpecUnits("12", "")).toBe("12");
  });

  // Running it over a value it has already repaired must not change it again:
  // the blob path normalises on the way out of parseSpecBlob and parseProductDetail
  // normalises again on the way into the table.
  it("is idempotent", () => {
    for (const v of ["34 kg", "12 months", "5 Years Frame, 2 Years Non-Wearable Parts"]) {
      expect(normalizeSpecUnits(normalizeSpecUnits(v, "kg"), "kg")).toBe(normalizeSpecUnits(v, "kg"));
    }
  });
});
