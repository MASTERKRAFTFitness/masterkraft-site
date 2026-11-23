import { describe, expect, it } from "vitest";
import { financeEligible, financeMetadata, financeSplit, isFinanceIntent } from "./grenke-finance";

describe("grenke finance", () => {
  it("is offered only over $5,000 ex GST", () => {
    expect(financeEligible(5500)).toBe(false); // exactly $5,000 ex GST
    expect(financeEligible(5500.11)).toBe(true);
    expect(financeEligible(4999)).toBe(false);
    expect(financeSplit(5000)).toBeNull();
  });

  it("splits a 20% deposit and prices the rest at the 60-month factor", () => {
    const s = financeSplit(11000)!; // $10,000 ex GST
    expect(s.deposit).toBe(2200);
    expect(s.balance).toBe(8800);
    expect(s.financedExGst).toBe(8000);
    expect(s.monthly).toBe(176); // 8000 × 2.2 / 100
    expect(s.weekly).toBe(40.62); // 176 × 12 / 52
  });

  it("deposit and balance always add up to the order", () => {
    for (const t of [5500.33, 7123.45, 12345.67, 99999.99]) {
      const s = financeSplit(t)!;
      expect(Math.round((s.deposit + s.balance) * 100)).toBe(Math.round(t * 100));
    }
  });

  it("marks the intent so fulfilment expects a deposit", () => {
    const md = financeMetadata(financeSplit(11000)!);
    expect(isFinanceIntent(md)).toBe(true);
    expect(md.finance_deposit).toBe("2200.00");
    expect(isFinanceIntent({})).toBe(false);
  });
});
