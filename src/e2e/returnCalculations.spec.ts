import { describe, it, expect } from 'vitest';
import { calculateTokenReturns, getTokenSupply, getTokenPayoutHistory } from '$lib/utils/returnCalculations';
import type { Asset } from '$lib/types/uiTypes';
import type { TokenMetadata } from '$lib/types/MetaboardTypes';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: '0xasset',
    name: 'Permian Basin-3',
    description: '',
    coverImage: '',
    images: [],
    galleryImages: [],
    status: 'producing',
    location: { state: 'TX', county: 'Reeves', country: 'USA', coordinates: { lat: 0, lng: 0 }, waterDepth: null },
    operator: { name: 'Operator', website: '', experience: '' },
    technical: {
      fieldType: 'Oil', depth: 0, license: '', estimatedLife: '', firstOil: '', infrastructure: '', environmental: '', expectedEndDate: '', crudeBenchmark: '',
      pricing: { benchmarkPremium: '0', transportCosts: '0' } as any,
    } as any,
    terms: { interestType: 'royalty', amount: 0, paymentFrequency: 30 } as any,
    assetTerms: { interestType: 'royalty', amount: 0, paymentFrequency: 30 } as any,
    plannedProduction: {
      oilPriceAssumption: 80,
      oilPriceAssumptionCurrency: 'USD',
      projections: [
        { month: '2025-01', production: 1000, revenue: 0 as any } as any,
        { month: '2025-02', production: 800, revenue: 0 as any } as any,
      ],
    } as any,
    plannedProductionData: [] as any,
    historicalProduction: [],
    metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ...overrides,
  } as any;
}

function makeToken(overrides: Partial<TokenMetadata> = {}): TokenMetadata {
  return {
    contractAddress: '0xtoken',
    symbol: 'PBR1',
    releaseName: 'Permian Basin-3 Release 1',
    tokenType: 'royalty' as any,
    firstPaymentDate: '2024-01',
    sharePercentage: 10,
    decimals: 18,
    supply: { maxSupply: (1000n * 10n**18n).toString(), mintedSupply: (500n * 10n**18n).toString() } as any,
    payoutData: [],
    asset: {
      assetName: 'Permian Basin-3',
      description: '',
      location: { state: 'TX', county: 'Reeves', country: 'USA' } as any,
      operator: { name: 'Operator', website: '', experienceYears: 0 },
      technical: { fieldType: 'Oil', license: '', firstOil: '2024-01', infrastructure: '', environmental: '', expectedEndDate: '2030-01', crudeBenchmark: '', pricing: { benchmarkPremium: 0, transportCosts: 0 } } as any,
      assetTerms: { interestType: 'royalty', amount: 0, paymentFrequencyDays: 30 },
      status: 'producing' as any,
      plannedProduction: { oilPriceAssumption: 80, projections: [] },
      historicalProduction: [],
      receiptsData: [], operationalMetrics: {} as any, documents: [], coverImage: '', galleryImages: []
    },
    metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ...overrides,
  };
}

describe('returnCalculations', () => {
  it('calculates base/bonus/implied barrels with on-chain minted supply', () => {
    const asset = makeAsset();
    const token = makeToken();
    const onChainMinted = (500n * 10n**18n).toString();
    const res = calculateTokenReturns(asset as any, token, onChainMinted);
    expect(res.baseReturn).toBeGreaterThan(0);
    expect(res.bonusReturn).toBeGreaterThanOrEqual(0);
    expect(res.impliedBarrelsPerToken).toBeGreaterThan(0);
    expect(res.breakEvenOilPrice).toBeGreaterThan(0);
  });

  it('handles zero minted supply: bonus -> very large, implied barrels -> Infinity, break-even 0', () => {
    const asset = makeAsset();
    const token = makeToken();
    const res = calculateTokenReturns(asset as any, token, '0');
    expect(res.bonusReturn).toBeGreaterThan(1e6);
    expect(res.impliedBarrelsPerToken).toBe(Infinity);
    expect(res.breakEvenOilPrice).toBe(0);
  });

  it('handles missing planned production or sharePercentage: returns zeros', () => {
    const asset = makeAsset({ plannedProduction: undefined as any });
    const token = makeToken({ sharePercentage: 0 });
    const res = calculateTokenReturns(asset as any, token, undefined);
    expect(res.baseReturn).toBe(0);
    expect(res.bonusReturn).toBe(0);
    expect(res.impliedBarrelsPerToken).toBe(0);
    expect(res.breakEvenOilPrice).toBe(0);
  });

  it('applies benchmark premium and transport costs when present on asset', () => {
    const asset = makeAsset({ technical: { pricing: { benchmarkPremium: '+5', transportCosts: '3' } } as any });
    const token = makeToken();
    const res = calculateTokenReturns(asset as any, token, (500n * 10n**18n).toString());
    expect(res.baseReturn).toBeGreaterThan(0);
  });

  it('getTokenSupply computes utilization and available supply', () => {
    const token = makeToken();
    const supply = getTokenSupply(token as any)!;
    expect(supply.maxSupply).toBe(1000);
    expect(supply.mintedSupply).toBe(500);
    expect(supply.availableSupply).toBe(500);
    expect(supply.supplyUtilization).toBeCloseTo(50);
  });

  it('getTokenPayoutHistory returns recent payouts or null', () => {
    const token = makeToken({ payoutData: [ { month: '2024-01', tokenPayout: { date: new Date().toISOString(), totalPayout: 100, payoutPerToken: 0.1, txHash: '0x' } } as any ] });
    const history = getTokenPayoutHistory(token as any)!;
    expect(history.recentPayouts.length).toBe(1);
    const noHistory = getTokenPayoutHistory(makeToken({ payoutData: undefined as any }) as any);
    expect(noHistory).toBeNull();
  });
});
