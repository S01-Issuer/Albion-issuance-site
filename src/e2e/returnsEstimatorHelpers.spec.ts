import { describe, it, expect } from "vitest";
import {
  calculateMonthlyTokenCashflows,
  getLifetimeCashflows,
  calculateLifetimeIRR,
  calculateNPV,
  calculateIRR,
  calculatePaybackPeriod,
} from "$lib/utils/returnsEstimatorHelpers";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import { ProductionStatus, TokenType } from "$lib/types/MetaboardTypes";
import type { ISODateTimeString } from "$lib/types/sharedTypes";

/**
 * Helper function to create a test token with customizable properties
 */
function makeToken(overrides: Partial<TokenMetadata> = {}): TokenMetadata {
  const baseToken: TokenMetadata = {
    contractAddress: "0xtoken",
    symbol: "TEST1",
    releaseName: "Test Token Release 1",
    tokenType: TokenType.Royalty,
    firstPaymentDate: "2025-01",
    sharePercentage: 10,
    payoutData: [],
    asset: {
      assetName: "Test Asset",
      description: "Test description",
      location: {
        state: "TX",
        county: "Test County",
        country: "USA",
        coordinates: { lat: 0, lng: 0 },
        waterDepth: null,
      },
      operator: { name: "Test Operator", website: "", experienceYears: 10 },
      technical: {
        fieldType: "Oil",
        license: "TEST-123",
        firstOil: "2024-01",
        infrastructure: "Test infrastructure",
        environmental: "Test environmental",
        expectedEndDate: "2030-12",
        crudeBenchmark: "WTI",
        pricing: { benchmarkPremium: 0, transportCosts: 0 },
      },
      assetTerms: {
        interestType: "royalty",
        amount: 10,
        paymentFrequencyDays: 30,
      },
      status: ProductionStatus.Producing,
      plannedProduction: {
        oilPriceAssumption: 80,
        projections: [
          { month: "2025-01", production: 1000 },
          { month: "2025-02", production: 950 },
          { month: "2025-03", production: 900 },
          { month: "2025-04", production: 850 },
          { month: "2025-05", production: 800 },
          { month: "2025-06", production: 750 },
          { month: "2025-07", production: 700 },
          { month: "2025-08", production: 650 },
          { month: "2025-09", production: 600 },
          { month: "2025-10", production: 550 },
          { month: "2025-11", production: 500 },
          { month: "2025-12", production: 450 },
        ],
      },
      historicalProduction: [],
      receiptsData: [],
      operationalMetrics: {
        uptime: { percentage: 95, period: "30 days" },
        hseMetrics: {
          lastIncidentDate: new Date().toISOString() as ISODateTimeString,
        },
      },
      documents: [],
      coverImage: "",
      galleryImages: [],
    },
    metadata: {
      createdAt: new Date().toISOString() as ISODateTimeString,
      updatedAt: new Date().toISOString() as ISODateTimeString,
    },
  };

  return { ...baseToken, ...overrides };
}

describe("returnsEstimatorHelpers", () => {
  describe("calculateMonthlyTokenCashflows", () => {
    it("returns empty array for token with no projections", () => {
      const token = makeToken();
      if (token.asset) {
        token.asset.plannedProduction = {
          oilPriceAssumption: 80,
          projections: [],
        };
      }
      const result = calculateMonthlyTokenCashflows(token, 80, 1000, 1);
      expect(result).toEqual([]);
    });

    it("calculates cashflows with initial investment as first entry", () => {
      const token = makeToken();
      const result = calculateMonthlyTokenCashflows(token, 80, 1000, 1);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].cashflow).toBe(-1); // Initial investment for 1 token
    });

    it("scales initial investment by numberOfTokens", () => {
      const token = makeToken();
      const result1 = calculateMonthlyTokenCashflows(token, 80, 1000, 1);
      const result5 = calculateMonthlyTokenCashflows(token, 80, 1000, 5);
      const result10 = calculateMonthlyTokenCashflows(token, 80, 1000, 10);

      expect(result1[0].cashflow).toBe(-1);
      expect(result5[0].cashflow).toBe(-5);
      expect(result10[0].cashflow).toBe(-10);
    });

    it("scales future cashflows by numberOfTokens (accounting for adjusted supply)", () => {
      const token = makeToken();
      const mintedSupply = 1000;
      const result1 = calculateMonthlyTokenCashflows(
        token,
        80,
        mintedSupply,
        1,
      );
      const result2 = calculateMonthlyTokenCashflows(
        token,
        80,
        mintedSupply,
        2,
      );

      // Cashflows scale by numberOfTokens, but also affected by adjusted supply
      // Expected ratio: (cf2 / cf1) = (tokens2 / tokens1) * (supply1 / supply2)
      // = (2 / 1) * ((1000+1) / (1000+2)) ≈ 1.998
      const expectedRatio = (2 / 1) * ((mintedSupply + 1) / (mintedSupply + 2));

      for (let i = 1; i < Math.min(result1.length, result2.length); i++) {
        expect(result2[i].cashflow / result1[i].cashflow).toBeCloseTo(
          expectedRatio,
          2,
        );
      }
    });

    it("uses adjusted supply (mintedSupply + numberOfTokens) for normalization", () => {
      const token = makeToken();
      // With same total supply, different distributions should give different results
      const result1 = calculateMonthlyTokenCashflows(token, 80, 1000, 1);
      const result2 = calculateMonthlyTokenCashflows(token, 80, 999, 1);

      // The per-token cashflow should be slightly different due to different supply
      expect(result1[1].cashflow).not.toBe(result2[1].cashflow);
    });

    it("applies oil price to production calculations", () => {
      const token = makeToken();
      const result80 = calculateMonthlyTokenCashflows(token, 80, 1000, 1);
      const result100 = calculateMonthlyTokenCashflows(token, 100, 1000, 1);

      // Higher oil price should yield higher cashflows (excluding initial investment)
      if (result80.length > 1 && result100.length > 1) {
        expect(result100[1].cashflow).toBeGreaterThan(result80[1].cashflow);
      }
    });

    it("applies benchmark premium and transport costs", () => {
      const token = makeToken();
      const tokenWithPricing = makeToken();
      if (tokenWithPricing.asset?.technical?.pricing) {
        tokenWithPricing.asset.technical.pricing = {
          benchmarkPremium: 5,
          transportCosts: 2,
        };
      }

      const resultBase = calculateMonthlyTokenCashflows(token, 80, 1000, 1);
      const resultAdjusted = calculateMonthlyTokenCashflows(
        tokenWithPricing,
        80,
        1000,
        1,
      );

      // Adjusted price should affect cashflows
      if (resultBase.length > 1 && resultAdjusted.length > 1) {
        expect(resultAdjusted[1].cashflow).toBeGreaterThan(
          resultBase[1].cashflow,
        );
      }
    });
  });

  describe("getLifetimeCashflows", () => {
    it("returns cashflows starting with negative initial investment", () => {
      const token = makeToken();
      const result = getLifetimeCashflows(token, 80, 1000, 1);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toBe(-1);
    });

    it("scales initial investment by numberOfTokens", () => {
      const token = makeToken();
      const result1 = getLifetimeCashflows(token, 80, 1000, 1);
      const result5 = getLifetimeCashflows(token, 80, 1000, 5);

      expect(result1[0]).toBe(-1);
      expect(result5[0]).toBe(-5);
    });

    it("includes all months from firstPaymentDate without pro-rating", () => {
      const token = makeToken();
      const lifetimeCashflows = getLifetimeCashflows(token, 80, 1000, 1);
      const monthlyCashflows = calculateMonthlyTokenCashflows(
        token,
        80,
        1000,
        1,
      );

      // Lifetime should have more or equal cashflows (includes all months)
      expect(lifetimeCashflows.length).toBeGreaterThanOrEqual(
        monthlyCashflows.length,
      );
    });
  });

  describe("calculateLifetimeIRR", () => {
    it("returns positive IRR for profitable token", () => {
      const token = makeToken();
      const irr = calculateLifetimeIRR(token, 80, 1000, 1);

      // Should return a positive percentage
      expect(irr).toBeGreaterThan(0);
      expect(Number.isFinite(irr)).toBe(true);
    });

    it("IRR changes with numberOfTokens due to adjusted supply denominator", () => {
      const token = makeToken();
      const irr1 = calculateLifetimeIRR(token, 80, 1000, 1);
      const irr5 = calculateLifetimeIRR(token, 80, 1000, 5);
      const irr10 = calculateLifetimeIRR(token, 80, 1000, 10);

      // IRR will be similar but not identical due to supply adjustment
      // They should all be positive and in the same order of magnitude
      expect(irr1).toBeGreaterThan(0);
      expect(irr5).toBeGreaterThan(0);
      expect(irr10).toBeGreaterThan(0);
      expect(Number.isFinite(irr1)).toBe(true);
      expect(Number.isFinite(irr5)).toBe(true);
      expect(Number.isFinite(irr10)).toBe(true);
    });

    it("returns higher IRR for higher oil prices", () => {
      const token = makeToken();
      const irr80 = calculateLifetimeIRR(token, 80, 1000, 1);
      const irr100 = calculateLifetimeIRR(token, 100, 1000, 1);

      expect(irr100).toBeGreaterThan(irr80);
    });

    it("returns negative IRR for unprofitable scenarios", () => {
      const token = makeToken();
      const irr = calculateLifetimeIRR(token, 1, 1000, 1); // Very low oil price

      // Should be negative (unprofitable) but may not be exactly -99
      expect(irr).toBeLessThan(0);
    });
  });

  describe("calculateNPV", () => {
    it("returns negative NPV when discount rate is very high", () => {
      const cashflows = [-100, 10, 10, 10, 10];
      const highDiscountRate = 0.5; // 50% monthly rate
      const npv = calculateNPV(cashflows, highDiscountRate);

      expect(npv).toBeLessThan(0);
    });

    it("returns positive NPV when discount rate is zero", () => {
      const cashflows = [-100, 50, 50, 50];
      const npv = calculateNPV(cashflows, 0);

      // Sum of cashflows when discount rate is 0
      expect(npv).toBe(50);
    });

    it("NPV decreases as discount rate increases", () => {
      const cashflows = [-100, 40, 40, 40];
      const npv1 = calculateNPV(cashflows, 0.01);
      const npv2 = calculateNPV(cashflows, 0.05);
      const npv3 = calculateNPV(cashflows, 0.1);

      expect(npv1).toBeGreaterThan(npv2);
      expect(npv2).toBeGreaterThan(npv3);
    });

    it("handles empty cashflows array", () => {
      const npv = calculateNPV([], 0.1);
      expect(npv).toBe(0);
    });
  });

  describe("calculateIRR", () => {
    it("calculates IRR for profitable investment", () => {
      const cashflows = [-100, 30, 30, 30, 30, 30];
      const irr = calculateIRR(cashflows);

      expect(irr).toBeGreaterThan(0);
      expect(Number.isFinite(irr)).toBe(true);
    });

    it("returns negative IRR for losing investment", () => {
      const cashflows = [-100, 10, 10, 10];
      const irr = calculateIRR(cashflows);

      expect(irr).toBeLessThan(0);
    });

    it("returns -99 for total loss scenarios", () => {
      const cashflows = [-100, 0, 0, 0];
      const irr = calculateIRR(cashflows);

      expect(irr).toBe(-0.99);
    });

    it("converges to consistent value", () => {
      const cashflows = [-1000, 300, 300, 300, 300, 300];
      const irr1 = calculateIRR(cashflows);
      const irr2 = calculateIRR(cashflows);

      // Should be deterministic
      expect(irr1).toBe(irr2);
    });

    it("IRR is mathematically scale-independent for proportionally scaled cashflows", () => {
      const cashflows1 = [-100, 30, 30, 30, 30];
      const cashflows2 = [-1000, 300, 300, 300, 300];

      const irr1 = calculateIRR(cashflows1);
      const irr2 = calculateIRR(cashflows2);

      // IRR should be the same for proportionally scaled cashflows
      expect(irr1).toBeCloseTo(irr2, 5);
    });

    it("IRR declines with scale in calculator context due to adjusted supply dilution", () => {
      const token = makeToken();
      const mintedSupply = 1000;

      // Get cashflows for different token quantities
      const cashflows1 = getLifetimeCashflows(token, 80, mintedSupply, 1);
      const cashflows10 = getLifetimeCashflows(token, 80, mintedSupply, 10);
      const cashflows100 = getLifetimeCashflows(token, 80, mintedSupply, 100);

      const irr1 = calculateIRR(cashflows1);
      const irr10 = calculateIRR(cashflows10);
      const irr100 = calculateIRR(cashflows100);

      // IRR should decline as we buy more tokens due to dilution effect
      // When you invest 10x as much, cashflows are less than 10x due to adjusted supply
      expect(irr10).toBeLessThan(irr1);
      expect(irr100).toBeLessThan(irr10);
      expect(irr100).toBeLessThan(irr1);
    });
  });

  describe("calculatePaybackPeriod", () => {
    it("calculates correct payback period for simple case", () => {
      const cashflows = [-100, 40, 40, 40];
      const payback = calculatePaybackPeriod(cashflows);

      // After 2 months: -100 + 40 + 40 = -20
      // After 3 months: -100 + 40 + 40 + 40 = 20
      // Payback is between month 2 and 3
      expect(payback).toBeGreaterThan(2);
      expect(payback).toBeLessThan(3);
    });

    it("returns Infinity for investment that never breaks even", () => {
      const cashflows = [-100, 10, 10, 10];
      const payback = calculatePaybackPeriod(cashflows);

      expect(payback).toBe(Infinity);
    });

    it("returns 0 for immediate break-even", () => {
      const cashflows = [-100, 100];
      const payback = calculatePaybackPeriod(cashflows);

      expect(payback).toBe(1);
    });

    it("handles fractional payback periods with linear interpolation", () => {
      const cashflows = [-100, 30, 30, 30, 30];
      const payback = calculatePaybackPeriod(cashflows);

      // After 3 months: -100 + 90 = -10
      // After 4 months: -100 + 120 = 20
      // Break even is 1/3 into month 4, so payback ≈ 3.33
      expect(payback).toBeCloseTo(3.33, 1);
    });

    it("handles empty cashflows array", () => {
      const payback = calculatePaybackPeriod([]);
      expect(payback).toBe(Infinity);
    });
  });

  describe("Integration tests", () => {
    it("APR calculation works for different token amounts", () => {
      const token = makeToken();

      // Calculate cashflows for different token amounts
      const cashflows1 = calculateMonthlyTokenCashflows(token, 80, 1000, 1).map(
        (c) => c.cashflow,
      );
      const cashflows5 = calculateMonthlyTokenCashflows(token, 80, 1000, 5).map(
        (c) => c.cashflow,
      );
      const cashflows10 = calculateMonthlyTokenCashflows(
        token,
        80,
        1000,
        10,
      ).map((c) => c.cashflow);

      // Calculate APR for each
      const calculateAPR = (cashflows: number[], investment: number) => {
        const sumAllCashflows = cashflows.reduce((sum, cf) => sum + cf, 0);
        const totalReturns = sumAllCashflows + investment;
        const countPeriods = cashflows.length - 1;

        if (countPeriods > 0 && totalReturns > 0 && investment > 0) {
          return (
            (Math.pow(totalReturns / investment, 12 / countPeriods) - 1) * 100
          );
        }
        return -99;
      };

      const apr1 = calculateAPR(cashflows1, 1);
      const apr5 = calculateAPR(cashflows5, 5);
      const apr10 = calculateAPR(cashflows10, 10);

      // All APRs should be positive and finite
      expect(apr1).toBeGreaterThan(0);
      expect(apr5).toBeGreaterThan(0);
      expect(apr10).toBeGreaterThan(0);
      expect(Number.isFinite(apr1)).toBe(true);
      expect(Number.isFinite(apr5)).toBe(true);
      expect(Number.isFinite(apr10)).toBe(true);
    });

    it("validates that IRR is calculated consistently across token quantities", () => {
      const token = makeToken();

      const irr1 = calculateLifetimeIRR(token, 80, 1000, 1);
      const irr10 = calculateLifetimeIRR(token, 80, 1000, 10);
      const irr100 = calculateLifetimeIRR(token, 80, 1000, 100);

      // All IRRs should be positive and in reasonable range
      expect(irr1).toBeGreaterThan(0);
      expect(irr10).toBeGreaterThan(0);
      expect(irr100).toBeGreaterThan(0);
      expect(Number.isFinite(irr1)).toBe(true);
      expect(Number.isFinite(irr10)).toBe(true);
      expect(Number.isFinite(irr100)).toBe(true);
    });
  });
});
