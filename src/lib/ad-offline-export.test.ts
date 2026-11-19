import { describe, expect, it } from "vitest";
import { adsTime, offlineConversions, offlineConversionsCsv, skipReason, type ExportableRow } from "./ad-offline-export";
import { cleanAdClick, clickIdsFrom } from "./ad-click";

const GCLID = "Cj0KCQiA_example-click-id_123";
const NAMES = { lead: "Lead offline", purchase: "Purchase offline" };

function row(over: Partial<ExportableRow> = {}): ExportableRow {
  return {
    kind: "quote",
    ref: "abc-123",
    gclid: GCLID,
    consent: "unspecified",
    value: 1200,
    exported_at: null,
    created_at: "2026-11-10T01:02:03.456Z",
    ...over,
  };
}

describe("clickIdsFrom", () => {
  it("reads gclid, gbraid and wbraid", () => {
    expect(clickIdsFrom(`?utm_source=google&gclid=${GCLID}&gbraid=0AAAAAbcdefghij`)).toEqual({
      gclid: GCLID,
      gbraid: "0AAAAAbcdefghij",
    });
  });
  it("returns null with no click id, or one that is not id-shaped", () => {
    expect(clickIdsFrom("?utm_source=google")).toBeNull();
    expect(clickIdsFrom("?gclid=<script>alert(1)</script>")).toBeNull();
    expect(clickIdsFrom("?gclid=short")).toBeNull();
  });
});

describe("cleanAdClick", () => {
  const now = Date.parse("2026-11-18T00:00:00Z");
  it("keeps a valid click and normalises consent", () => {
    expect(cleanAdClick({ gclid: GCLID, clickedAt: "2026-11-01T00:00:00Z", consent: "granted" }, now)).toEqual({
      gclid: GCLID,
      clickedAt: "2026-11-01T00:00:00.000Z",
      consent: "granted",
    });
    expect(cleanAdClick({ gclid: GCLID, clickedAt: "2026-11-01T00:00:00Z", consent: "denied" }, now)?.consent).toBe(
      "unspecified"
    );
  });
  it("rejects clicks outside the 90-day window or in the future", () => {
    expect(cleanAdClick({ gclid: GCLID, clickedAt: "2026-08-01T00:00:00Z" }, now)).toBeNull();
    expect(cleanAdClick({ gclid: GCLID, clickedAt: "2026-11-19T00:00:00Z" }, now)).toBeNull();
  });
  it("rejects anything without a valid id", () => {
    expect(cleanAdClick(null, now)).toBeNull();
    expect(cleanAdClick({ gclid: "bad id!", clickedAt: "2026-11-01T00:00:00Z" }, now)).toBeNull();
  });
});

describe("skipReason", () => {
  it("uploads an unconsented quote or brief", () => {
    expect(skipReason(row())).toBeNull();
    expect(skipReason(row({ kind: "brief", value: null }))).toBeNull();
  });
  it("leaves out what the tag already counted, what has no gclid, and what was uploaded", () => {
    expect(skipReason(row({ consent: "granted" }))).toBe("consented");
    expect(skipReason(row({ gclid: null }))).toBe("no_gclid");
    expect(skipReason(row({ exported_at: "2026-11-11T00:00:00Z" }))).toBe("exported");
  });
  it("counts a checkout only once it is paid", () => {
    expect(skipReason(row({ kind: "checkout", checkout_status: "quoted" }))).toBe("not_converted");
    expect(skipReason(row({ kind: "checkout", checkout_status: "quote_requested" }))).toBe("not_converted");
    expect(skipReason(row({ kind: "checkout", checkout_status: "paid" }))).toBeNull();
  });
});

describe("offlineConversions", () => {
  it("maps checkouts to the purchase action and leads to the lead action", () => {
    const out = offlineConversions(
      [
        row({ kind: "checkout", ref: "c1", checkout_status: "paid", value: 499 }),
        row({ kind: "quote", ref: "q1" }),
        row({ kind: "brief", ref: "b1", value: 50 }),
        row({ kind: "checkout", ref: "c2", checkout_status: "quoted" }),
      ],
      NAMES
    );
    expect(out.map((c) => [c.ref, c.name, c.value])).toEqual([
      ["c1", "Purchase offline", 499],
      ["q1", "Lead offline", 1200],
      ["b1", "Lead offline", null],
    ]);
  });
});

describe("offlineConversionsCsv", () => {
  it("writes Google's template with UTC offsets and blank value for a brief", () => {
    const csv = offlineConversionsCsv(offlineConversions([row(), row({ kind: "brief", ref: "b1" })], NAMES));
    expect(csv).toBe(
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\n" +
        `${GCLID},Lead offline,2026-11-10 01:02:03+00:00,1200.00,AUD\n` +
        `${GCLID},Lead offline,2026-11-10 01:02:03+00:00,,\n`
    );
  });
  it("formats time without milliseconds", () => {
    expect(adsTime("2026-11-18T23:59:59.999Z")).toBe("2026-11-18 23:59:59+00:00");
  });
});
