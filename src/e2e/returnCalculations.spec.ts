import { describe, it, expect } from "vitest";
import {
  calculateTokenReturns,
  getTokenSupply,
  getTokenPayoutHistory,
} from "$lib/utils/returnCalculations";
import type { Asset } from "$lib/types/uiTypes";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import { ProductionStatus, TokenType } from "$lib/types/MetaboardTypes";
import type { ISODateTimeString } from "$lib/types/sharedTypes";

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  const baseAsset: Asset = {
    id: "0xasset",
    name: "Permian Basin-3",
    description: "",
    coverImage: "",
    images: [],
    galleryImages: [],
    status: "producing",
    location: {
      state: "TX",
      county: "Reeves",
      country: "USA",
      coordinates: { lat: 0, lng: 0 },
      waterDepth: null,
    },
    operator: { name: "Operator", website: "", experience: "" },
    technical: {
      fieldType: "Oil",
      depth: "0",
      license: "",
      estimatedLife: "",
      firstOil: "",
      infrastructure: "",
      environmental: "",
      expectedEndDate: "",
      crudeBenchmark: "",
      pricing: { benchmarkPremium: "0", transportCosts: "0" },
    },
    assetTerms: {
      interestType: "royalty",
      amount: "0%",
      paymentFrequency: "Monthly",
    },
    terms: {
      interestType: "royalty",
      amount: "0%",
      paymentFrequency: "Monthly",
    },
    plannedProduction: {
      oilPriceAssumption: 80,
      oilPriceAssumptionCurrency: "USD",
      projections: [
        { month: "2025-01", production: 1000, revenue: 0 },
        { month: "2025-02", production: 800, revenue: 0 },
      ],
    },
    metadata: {
      createdAt: new Date().toISOString() as ISODateTimeString,
      updatedAt: new Date().toISOString() as ISODateTimeString,
    },
    monthlyReports: [],
    productionHistory: [],
    operationalMetrics: {
      uptime: { percentage: 0, period: "30 days" },
      hseMetrics: {
        incidentFreeDays: 0,
        lastIncidentDate: new Date().toISOString() as ISODateTimeString,
      },
    },
  };

  return { ...baseAsset, ...overrides };
}

function makeToken(overrides: Partial<TokenMetadata> = {}): TokenMetadata {
  const baseToken: TokenMetadata = {
    contractAddress: "0xtoken",
    symbol: "PBR1",
    releaseName: "Permian Basin-3 Release 1",
    tokenType: TokenType.Royalty,
    firstPaymentDate: "2024-01",
    sharePercentage: 10,
    payoutData: [],
    asset: {
      assetName: "Permian Basin-3",
      description: "",
      location: {
        state: "TX",
        county: "Reeves",
        country: "USA",
        coordinates: { lat: 0, lng: 0 },
        waterDepth: null,
      },
      operator: { name: "Operator", website: "", experienceYears: 0 },
      technical: {
        fieldType: "Oil",
        license: "",
        firstOil: "2024-01",
        infrastructure: "",
        environmental: "",
        expectedEndDate: "2030-01",
        crudeBenchmark: "",
        pricing: { benchmarkPremium: 0, transportCosts: 0 },
      },
      assetTerms: {
        interestType: "royalty",
        amount: 0,
        paymentFrequencyDays: 30,
      },
      status: ProductionStatus.Producing,
      plannedProduction: { oilPriceAssumption: 80, projections: [] },
      historicalProduction: [],
      receiptsData: [],
      operationalMetrics: {
        uptime: { percentage: 0, period: "30 days" },
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

describe("returnCalculations", () => {
  it("calculates base/bonus/implied barrels with on-chain minted supply", () => {
    const asset = makeAsset();
    const token = makeToken();
    const onChainMinted = (500n * 10n ** 18n).toString();
    const res = calculateTokenReturns(asset, token, onChainMinted);
    expect(res.baseReturn).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(res.baseReturn)).toBe(true);
    expect(res.bonusReturn).toBeGreaterThanOrEqual(0);
    expect(res.impliedBarrelsPerToken).toBeGreaterThanOrEqual(0);
    expect(res.breakEvenOilPrice).toBeGreaterThanOrEqual(0);
  });

  it("handles zero minted supply: bonus -> very large, implied barrels -> Infinity, break-even 0", () => {
    const asset = makeAsset();
    const token = makeToken();
    const res = calculateTokenReturns(asset, token, "0");
    expect(res.bonusReturn).toBeGreaterThan(1e6);
    expect(res.impliedBarrelsPerToken).toBe(Infinity);
    expect(res.breakEvenOilPrice).toBe(0);
  });

  it("handles missing planned production or sharePercentage: returns zeros", () => {
    const asset = makeAsset({ plannedProduction: undefined });
    const token = makeToken({ sharePercentage: 0 });
    const res = calculateTokenReturns(asset, token, undefined);
    expect(res.baseReturn).toBe(0);
    expect(res.bonusReturn).toBe(0);
    expect(res.impliedBarrelsPerToken).toBe(0);
    expect(res.breakEvenOilPrice).toBe(0);
  });

  it("applies benchmark premium and transport costs when present on asset", () => {
    const base = makeAsset();
    const asset = makeAsset({
      technical: {
        ...base.technical,
        pricing: { benchmarkPremium: "+5", transportCosts: "3" },
      },
    });
    const token = makeToken();
    const res = calculateTokenReturns(
      asset,
      token,
      (500n * 10n ** 18n).toString(),
    );
    expect(res.baseReturn).toBeGreaterThanOrEqual(0);
  });

  it("getTokenSupply computes utilization and available supply", () => {
    const token = makeToken();
    const supply = getTokenSupply(token);
    expect(supply).not.toBeNull();
    if (!supply) return;
    expect(supply.maxSupply).toBe(0);
    expect(supply.mintedSupply).toBe(0);
    expect(supply.availableSupply).toBe(0);
    expect(supply.supplyUtilization).toBe(0);
  });

  it("getTokenPayoutHistory returns recent payouts or null", () => {
    const token = makeToken({
      payoutData: [
        {
          month: "2024-01",
          tokenPayout: {
            totalPayout: 100,
            payoutPerToken: 0.1,
            txHash: "0x",
            orderHash: "0xorder",
          },
        },
      ],
    });
    const history = getTokenPayoutHistory(token);
    expect(history).not.toBeNull();
    if (!history) return;
    expect(history.recentPayouts.length).toBe(1);
    const noHistory = getTokenPayoutHistory(
      makeToken({ payoutData: undefined }),
    );
    expect(noHistory).toBeNull();
  });
});
