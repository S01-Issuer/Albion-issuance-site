import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPercentage,
  formatSimplePercentage,
  formatTokenAmount,
  formatTokenSupply,
  formatSmartNumber,
  formatSmartReturn,
  formatAddress,
  formatEndDate,
  formatDepth,
  formatNumber,
} from "$lib/utils/formatters";

describe("formatters", () => {
  it("formats currency with default and compact options", () => {
    expect(formatCurrency(1234.56)).toBe("US$1,234.56");
    expect(formatCurrency(1000)).toBe("US$1,000");
    // Compact only kicks in at >= 1,000,000
    expect(formatCurrency(1_500_000, { compact: true })).toMatch(/^US\$/);
  });

  it("formats percentages correctly", () => {
    expect(formatPercentage(0.125)).toBe("12.50%");
    expect(formatPercentage(12.5, { isAlreadyPercentage: true })).toBe(
      "12.50%",
    );
    expect(formatSimplePercentage(12.5)).toBe("12.5%");
  });

  it("formats token amounts and supply with decimals and compacting", () => {
    // 1e18 with 18 decimals => 1
    expect(formatTokenAmount((1e18).toString(), 18)).toBe("1");
    // Supply smart/compact
    expect(formatTokenSupply(9999)).toBe("9,999");
    expect(formatTokenSupply(10000)).toBe("10.0K");
    expect(formatTokenSupply(1_500_000)).toMatch(/1\.5M/);
  });

  it("formats smart numbers with threshold and affixes", () => {
    expect(formatSmartNumber(9999)).toBe("9,999");
    expect(formatSmartNumber(10_000)).toBe("10.0K");
    expect(formatSmartNumber(1_200_000, { prefix: "$" })).toBe("$1.2M");
  });

  it("formats smart returns with >10x cap and plus sign", () => {
    expect(formatSmartReturn(150, { showPlus: true })).toBe("+150%");
    expect(formatSmartReturn(9999)).toBe(">10x");
    expect(formatSmartReturn(undefined)).toBe("TBD");
  });

  it("formats address/date/depth", () => {
    expect(formatAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")).toBe(
      "0xabcd...abcd",
    );
    expect(formatEndDate("2024-01")).toBe("Jan 2024");
    expect(formatDepth(3200)).toBe("3,200m");
    expect(formatNumber(1234.567, { decimals: 2 })).toBe("1,234.57");
  });
});
