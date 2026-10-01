// The window the /returns page states and the window the structured data
// claims must be the same number; Google flags a mismatch against the page.
import { describe, expect, it } from "vitest";
import { legalContent } from "@/lib/legal-content";
import { RETURN_WINDOW_DAYS, merchantReturnPolicy } from "@/lib/return-policy";

const returnsText = legalContent.returns.flatMap((s) => s.body).join("\n");

describe("return policy", () => {
  it("states the same window on the returns page as in the markup", () => {
    expect(merchantReturnPolicy().merchantReturnDays).toBe(RETURN_WINDOW_DAYS);
    expect(returnsText).toContain(`within ${RETURN_WINDOW_DAYS} days of delivery`);
  });

  it("states no other window anywhere on the page", () => {
    const windows = [...returnsText.matchAll(/within (\d+) days of delivery/g)].map((m) => Number(m[1]));
    expect(windows.length).toBeGreaterThan(0);
    expect(new Set(windows)).toEqual(new Set([RETURN_WINDOW_DAYS]));
  });

  it("says the customer pays return postage, as the markup does", () => {
    expect(merchantReturnPolicy().returnFees).toBe("https://schema.org/ReturnFeesCustomerResponsibility");
    expect(returnsText).toContain("Customers will be responsible for return shipping costs.");
  });

  it("refunds to the original payment and charges no restocking fee", () => {
    expect(merchantReturnPolicy().refundType).toBe("https://schema.org/FullRefund");
    expect(merchantReturnPolicy()).not.toHaveProperty("restockingFee");
    expect(returnsText).not.toMatch(/restocking/i);
    expect(returnsText).not.toMatch(/store credit/i);
  });
});
