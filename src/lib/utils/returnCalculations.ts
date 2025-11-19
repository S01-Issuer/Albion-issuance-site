/**
 * Return calculation utilities for royalty tokens
 * Based on planned production data and token supply metrics
 */

import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import type { Asset } from "$lib/types/uiTypes";
import type { OffchainAssetReceiptVault } from "$lib/types/graphql";

export interface TokenReturns {
  baseReturn: number; // Annual percentage
  bonusReturn: number; // Annual percentage
  impliedBarrelsPerToken: number; // Barrels per $1 token
  breakEvenOilPrice: number; // USD per barrel
}

interface TokenSupplyBreakdown {
  maxSupply: number;
  mintedSupply: number;
  supplyUtilization: number;
  availableSupply: number;
}

interface TokenPayoutSummary {
  month: string;
  totalPayout: number;
  payoutPerToken: number;
  orderHash: string;
  txHash: string;
}

/**
 * Calculate IRR (Internal Rate of Return) using Newton's method
 * @param cashFlows Array of cash flows where index 0 is the initial investment (negative)
 * @returns IRR as a decimal (e.g., 0.12 for 12%)
 */
function calculateIRR(cashFlows: number[]): number {
  const maxIterations = 100;
  const tolerance = 1e-7;
  let rate = 0.1; // Initial guess of 10%

  // Check if the investment can ever be recovered
  const totalInflows = cashFlows.slice(1).reduce((sum, cf) => sum + cf, 0);
  const initialOutflow = Math.abs(cashFlows[0]);

  if (totalInflows < initialOutflow * 0.01) {
    // Total inflows are less than 1% of initial investment
    // This is essentially a total loss
    return -0.99; // -99% monthly return
  }

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0;

    for (let j = 0; j < cashFlows.length; j++) {
      const factor = Math.pow(1 + rate, j);
      npv += cashFlows[j] / factor;
      dnpv -= (j * cashFlows[j]) / Math.pow(1 + rate, j + 1);
    }

    // Protect against division by zero or infinity
    if (!isFinite(dnpv) || Math.abs(dnpv) < 1e-10) {
      return -0.99; // Return maximum loss if derivative is invalid
    }

    const newRate = rate - npv / dnpv;

    // Bound the rate to prevent divergence
    if (!isFinite(newRate) || newRate < -0.99) {
      return -0.99; // Maximum loss
    }
    if (newRate > 100) {
      return 100; // Cap at 10,000% monthly (unrealistic but prevents infinity)
    }

    if (Math.abs(newRate - rate) < tolerance) {
      return newRate;
    }

    rate = newRate;
  }

  return rate;
}

/**
 * Calculate token returns based on planned production and token metrics
 * Using IRR methodology as specified
 * @param asset Asset data containing planned production
 * @param token Token data containing supply and share percentage
 * @param onChainMintedSupply Optional on-chain minted supply (in wei) to use for bonus calculation
 * @returns Calculated returns and metrics
 */
export function calculateTokenReturns(
  asset: Asset,
  token: TokenMetadata,
  onChainMintedSupply?: string,
  maxSupply?: string,
): TokenReturns {
  if (!asset.plannedProduction || !token.sharePercentage) {
    console.warn(
      `[Returns] Missing data for ${token.symbol}: plannedProduction=${!!asset.plannedProduction}, sharePercentage=${token.sharePercentage}`,
    );
    return {
      baseReturn: 0,
      bonusReturn: 0,
      impliedBarrelsPerToken: 0,
      breakEvenOilPrice: 0,
    };
  }

  const { plannedProduction } = asset;
  const { projections, oilPriceAssumption } = plannedProduction;
  const sharePercentage = token.sharePercentage / 100; // Convert to decimal

  console.warn(
    `[Returns] Token ${token.symbol}: projections length = ${projections?.length}, oilPriceAssumption = ${oilPriceAssumption}`,
  );
  if (!projections || projections.length === 0) {
    console.warn(`[Returns] No projections for ${token.symbol}`);
    return {
      baseReturn: 0,
      bonusReturn: 0,
      impliedBarrelsPerToken: 0,
      breakEvenOilPrice: 0,
    };
  }

  // Get pricing adjustments from asset technical data
  const benchmarkPremium = asset.technical?.pricing?.benchmarkPremium
    ? parseFloat(
        asset.technical.pricing.benchmarkPremium.replace(/[^-\d.]/g, ""),
      )
    : token.asset?.technical?.pricing?.benchmarkPremium || 0;
  const transportCosts = asset.technical?.pricing?.transportCosts
    ? parseFloat(asset.technical.pricing.transportCosts.replace(/[^-\d.]/g, ""))
    : token.asset?.technical?.pricing?.transportCosts || 0;

  // Calculate adjusted oil price
  const adjustedOilPrice =
    oilPriceAssumption + benchmarkPremium - transportCosts;

  // Convert supply to numbers using provided maxSupply parameter
  const maxSupplyNum = maxSupply
    ? Number(BigInt(maxSupply) / BigInt(10 ** 18))
    : 0;

  // ALWAYS use on-chain minted supply for accurate bonus calculation
  // Never trust IPFS metadata for minted supply as it's not updated in real-time
  let mintedSupply: number;
  if (onChainMintedSupply) {
    // On-chain value is in wei, convert to token units
    // If it's "0" or any falsy value, this will correctly evaluate to 0
    try {
      // TokenMetadata no longer has decimals field - using default of 18
      mintedSupply = Number(BigInt(onChainMintedSupply) / BigInt(10 ** 18));
    } catch {
      // If BigInt conversion fails, default to 0
      mintedSupply = 0;
    }
  } else {
    // No on-chain data provided, default to 0
    // This ensures we never use stale IPFS data
    mintedSupply = 0;
  }

  // Get pending distributions (from receiptsData before firstPaymentDate)
  const receiptsData = token.asset?.receiptsData || [];

  // Use token.firstPaymentDate as cashflow start, with hardcoded override for specific token
  let cashflowStartDate = token.firstPaymentDate || projections[0]?.month;
  if (token.contractAddress?.toLowerCase() === '0xf836a500910453a397084ade41321ee20a5aade1') {
    cashflowStartDate = '2025-08';
  }

  // Calculate pending distributions
  let pendingDistributionsTotal = 0;
  const receiptsMap = new Map<string, number>();
  for (const receipt of receiptsData) {
    if (receipt.assetData?.revenue !== undefined) {
      receiptsMap.set(receipt.month, receipt.assetData.revenue);
    }
  }

  // Sum pending distributions from months before cashflowStartDate
  for (const projection of projections) {
    if (projection.month < cashflowStartDate) {
      if (receiptsMap.has(projection.month)) {
        pendingDistributionsTotal += receiptsMap.get(projection.month) || 0;
      } else {
        // Estimate using production * oil price
        pendingDistributionsTotal += projection.production * adjustedOilPrice;
      }
    }
  }

  const monthlyPendingDistribution = pendingDistributionsTotal / 12;

  // Helper function to add months
  function addMonths(dateStr: string, months: number): string {
    const [year, month] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    date.setMonth(date.getMonth() + months);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    return `${newYear}-${newMonth}`;
  }

  // Build cash flows for IRR calculation
  // Start with initial investment of -$1 at month 0
  const baseCashFlows = [-1]; // Month 0: pay $1 per token
  const mintedCashFlows = [-1]; // Month 0: pay $1 per token

  let totalProduction = 0;
  const pendingDistributionsEndDate = addMonths(cashflowStartDate, 12);

  for (const projection of projections) {
    // Step 1 & 2: Production * adjusted oil price (with benchmark premium and transport costs)
    let monthlyRevenue = projection.production * adjustedOilPrice;

    // Add pending distributions for first 12 months from cashflowStartDate
    if (projection.month >= cashflowStartDate && projection.month < pendingDistributionsEndDate) {
      monthlyRevenue += monthlyPendingDistribution;
    }

    // Step 3: Apply token's share of asset
    const tokenShareRevenue = monthlyRevenue * sharePercentage;

    // Step 4a: Revenue per token using max supply (base case)
    const revenuePerTokenBase = tokenShareRevenue / maxSupplyNum;
    baseCashFlows.push(revenuePerTokenBase);

    // Step 4b: Revenue per token using minted supply (bonus case)
    const revenuePerTokenMinted =
      mintedSupply > 0 ? tokenShareRevenue / mintedSupply : 0;
    mintedCashFlows.push(revenuePerTokenMinted);

    totalProduction += projection.production;
  }

  // Calculate returns
  let baseReturn: number;
  let bonusReturn: number;

  // Calculate base return (using max supply)
  const monthlyIRRBase = calculateIRR(baseCashFlows);

  // Handle edge cases in IRR calculation
  if (monthlyIRRBase <= -0.99) {
    // IRR is -99% or worse monthly (total loss)
    baseReturn = 0; // Base return should never be negative - represents minimum return
  } else if (monthlyIRRBase > 10) {
    // IRR is unrealistically high (>1000% monthly), cap at very high value
    baseReturn = 99999999999;
  } else {
    // Normal calculation
    baseReturn = Math.max(0, (Math.pow(1 + monthlyIRRBase, 12) - 1) * 100);
  }

  // Calculate bonus return
  if (mintedSupply === 0) {
    // When no tokens are minted, the return is effectively infinite
    // Use a very large number that will be displayed as ">10x" in the UI
    bonusReturn = 99999999999;
  } else {
    // Normal calculation for non-zero minted supply
    const monthlyIRRMinted = calculateIRR(mintedCashFlows);
    const totalReturn = (Math.pow(1 + monthlyIRRMinted, 12) - 1) * 100;
    bonusReturn = totalReturn - baseReturn;
  }

  // Calculate implied barrels per $1 token
  // This represents how many barrels of oil each $1 investment in the token represents
  // ONLY uses on-chain minted supply - no fallbacks
  // When no tokens are minted, the implied barrels is infinite
  const impliedBarrelsPerToken =
    mintedSupply > 0
      ? (totalProduction * sharePercentage) / mintedSupply
      : Infinity;

  // Calculate breakeven oil price (price needed to recover $1 per token)
  // This is the oil price where total revenue equals total token investment
  // Formula: (minted supply * $1) / (total barrels * share percentage)
  const breakEvenOilPrice =
    totalProduction * sharePercentage > 0
      ? mintedSupply / (totalProduction * sharePercentage)
      : 0;

  return {
    baseReturn: baseReturn, // Always >= 0, represents minimum guaranteed return
    bonusReturn: bonusReturn, // Can be negative if bonus is less than base
    impliedBarrelsPerToken,
    breakEvenOilPrice,
  };
}

/**
 * Get calculated returns for a token, with caching
 */
const returnCache = new Map<string, TokenReturns>();

export function getTokenReturns(
  asset: Asset,
  token: TokenMetadata,
  onChainMintedSupply?: string,
  maxSupply?: string,
): TokenReturns {
  const cacheKey = `${asset.id}-${token.contractAddress}-${onChainMintedSupply || "ipfs"}-${maxSupply || "unknown"}`;

  const cached = returnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const returns = calculateTokenReturns(
    asset,
    token,
    onChainMintedSupply,
    maxSupply,
  );
  returnCache.set(cacheKey, returns);

  return returns;
}

/**
 * Clear the returns cache (useful when data changes)
 */
export function clearReturnsCache(): void {
  returnCache.clear();
}

export function getTokenSupply(
  token: TokenMetadata,
  sft?: Pick<OffchainAssetReceiptVault, "totalShares">,
  maxSupplyString?: string,
): TokenSupplyBreakdown | null {
  if (!token) return null;

  // If SFT and maxSupply data provided, use them
  if (sft && maxSupplyString) {
    const decimals = 18; // Standard decimals
    const maxSupply =
      Number.parseFloat(maxSupplyString) / Math.pow(10, decimals);
    const mintedSupply =
      Number.parseFloat(sft.totalShares) / Math.pow(10, decimals);
    const supplyUtilization =
      maxSupply > 0 ? (mintedSupply / maxSupply) * 100 : 0;

    return {
      maxSupply,
      mintedSupply,
      supplyUtilization,
      availableSupply: maxSupply - mintedSupply,
    };
  }

  // Fallback to defaults if no SFT data
  return {
    maxSupply: 0,
    mintedSupply: 0,
    supplyUtilization: 0,
    availableSupply: 0,
  };
}

export function getTokenPayoutHistory(
  token: TokenMetadata,
): { recentPayouts: TokenPayoutSummary[] } | null {
  if (!token || !Array.isArray(token.payoutData)) {
    return null;
  }

  const recentPayouts = token.payoutData
    .filter((payout) => payout?.month && payout?.tokenPayout)
    .map((payout) => ({
      month: payout.month,
      totalPayout: toNumber(payout.tokenPayout.totalPayout),
      payoutPerToken: toNumber(payout.tokenPayout.payoutPerToken),
      orderHash: payout.tokenPayout.orderHash,
      txHash: payout.tokenPayout.txHash,
    }))
    .sort((a, b) => (a.month > b.month ? 1 : a.month < b.month ? -1 : 0));

  console.warn("[getTokenPayoutHistory] Payout data", {
    contractAddress: token.contractAddress,
    count: recentPayouts.length,
    months: recentPayouts.map((entry) => entry.month),
  });

  return { recentPayouts };
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^-\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return 0;
}
