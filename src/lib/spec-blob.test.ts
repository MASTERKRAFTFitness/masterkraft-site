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
      { label: "Net weight", value: "40kg" },
    ]);
    // Untouched fields still come from the blob.
    expect(specs).toContainEqual({ label: "Material", value: "Hard wearing vinyl cover" });
  });

  it("stays empty when the product has neither source", () => {
    expect(parseProductDetail(product([])).specs).toEqual([]);
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
});
