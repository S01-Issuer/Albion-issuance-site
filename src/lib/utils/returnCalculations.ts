/**
 * Return calculation utilities for royalty tokens
 * Based on planned production data and token supply metrics
 */

import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import type {
  Asset,
  Token,
  PlannedProductionProjection,
} from "$lib/types/uiTypes";

export interface TokenReturns {
  baseReturn: number; // Annual percentage
  bonusReturn: number; // Annual percentage
  impliedBarrelsPerToken: number; // Barrels per $1 token
  breakEvenOilPrice: number; // USD per barrel
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
      dnpv -= j * cashFlows[j] / Math.pow(1 + rate, j + 1);
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
): TokenReturns {
  if (!asset.plannedProduction || !token.sharePercentage) {
    console.log(`[Returns] Missing data for ${token.symbol}: plannedProduction=${!!asset.plannedProduction}, sharePercentage=${token.sharePercentage}`);
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
  
  console.log(`[Returns] Token ${token.symbol}: projections length = ${projections?.length}, oilPriceAssumption = ${oilPriceAssumption}`);
  if (!projections || projections.length === 0) {
    console.log(`[Returns] No projections for ${token.symbol}`);
    return {
      baseReturn: 0,
      bonusReturn: 0,
      impliedBarrelsPerToken: 0,
      breakEvenOilPrice: 0,
    };
  }

  // Get pricing adjustments from asset technical data
  const benchmarkPremium = asset.technical?.pricing?.benchmarkPremium 
    ? parseFloat(asset.technical.pricing.benchmarkPremium.replace(/[^-\d.]/g, ''))
    : (token.asset?.technical?.pricing?.benchmarkPremium || 0);
  const transportCosts = asset.technical?.pricing?.transportCosts
    ? parseFloat(asset.technical.pricing.transportCosts.replace(/[^-\d.]/g, ''))
    : (token.asset?.technical?.pricing?.transportCosts || 0);

  // Calculate adjusted oil price
  const adjustedOilPrice = oilPriceAssumption + benchmarkPremium - transportCosts;

  // Convert supply to numbers
  const maxSupply =
    typeof token.supply?.maxSupply === "string"
      ? Number(BigInt(token.supply.maxSupply) / BigInt(10 ** token.decimals))
      : Number(token.supply?.maxSupply || 0);
  
  // ALWAYS use on-chain minted supply for accurate bonus calculation
  // Never trust IPFS metadata for minted supply as it's not updated in real-time
  let mintedSupply: number;
  if (onChainMintedSupply) {
    // On-chain value is in wei, convert to token units
    // If it's "0" or any falsy value, this will correctly evaluate to 0
    try {
      mintedSupply = Number(BigInt(onChainMintedSupply) / BigInt(10 ** token.decimals));
    } catch {
      // If BigInt conversion fails, default to 0
      mintedSupply = 0;
    }
  } else {
    // No on-chain data provided, default to 0
    // This ensures we never use stale IPFS data
    mintedSupply = 0;
  }
  

  // Build cash flows for IRR calculation
  // Start with initial investment of -$1 at month 0
  const baseCashFlows = [-1]; // Month 0: pay $1 per token
  const mintedCashFlows = [-1]; // Month 0: pay $1 per token
  
  let totalProduction = 0;

  for (const projection of projections) {
    // Step 1 & 2: Production * adjusted oil price (with benchmark premium and transport costs)
    const monthlyRevenue = projection.production * adjustedOilPrice;

    // Step 3: Apply token's share of asset
    const tokenShareRevenue = monthlyRevenue * sharePercentage;

    // Step 4a: Revenue per token using max supply (base case)
    const revenuePerTokenBase = tokenShareRevenue / maxSupply;
    baseCashFlows.push(revenuePerTokenBase);

    // Step 4b: Revenue per token using minted supply (bonus case)
    const revenuePerTokenMinted = mintedSupply > 0 ? tokenShareRevenue / mintedSupply : 0;
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
    baseReturn = -100; // Total loss
  } else if (monthlyIRRBase > 10) {
    // IRR is unrealistically high (>1000% monthly), cap at very high value
    baseReturn = 99999999999;
  } else {
    // Normal calculation
    baseReturn = (Math.pow(1 + monthlyIRRBase, 12) - 1) * 100;
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
  const impliedBarrelsPerToken = mintedSupply > 0
    ? (totalProduction * sharePercentage) / mintedSupply
    : Infinity;

  // Calculate breakeven oil price (price needed to recover $1 per token)
  // This is the oil price where total revenue equals total token investment
  // Formula: (minted supply * $1) / (total barrels * share percentage)
  const breakEvenOilPrice = totalProduction * sharePercentage > 0
    ? mintedSupply / (totalProduction * sharePercentage)
    : 0;

  return {
    baseReturn: baseReturn, // Keep negative values for proper display
    bonusReturn: bonusReturn, // Keep negative values for proper display
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
): TokenReturns {
  const cacheKey = `${asset.id}-${token.contractAddress}-${onChainMintedSupply || 'ipfs'}`;

  if (returnCache.has(cacheKey)) {
    return returnCache.get(cacheKey)!;
  }

  const returns = calculateTokenReturns(asset, token, onChainMintedSupply);
  returnCache.set(cacheKey, returns);

  return returns;
}

/**
 * Clear the returns cache (useful when data changes)
 */
export function clearReturnsCache(): void {
  returnCache.clear();
}

export function getTokenSupply(token: TokenMetadata) {
  if (!token) return null;

  const maxSupply =
    parseFloat(token.supply.maxSupply) / Math.pow(10, token.decimals);
  const mintedSupply =
    parseFloat(token.supply.mintedSupply) / Math.pow(10, token.decimals);
  const supplyUtilization = (mintedSupply / maxSupply) * 100;

  return {
    maxSupply,
    mintedSupply,
    supplyUtilization,
    availableSupply: maxSupply - mintedSupply,
  };
}

export function getTokenPayoutHistory(
  token: TokenMetadata,
): { recentPayouts: any[] } | null {
  if (!token || !token.payoutData) {
    return null;
  }

  return {
    recentPayouts: token.payoutData.map((payout) => ({
      month: payout.month,
      totalPayout: payout.tokenPayout.totalPayout,
      payoutPerToken: payout.tokenPayout.payoutPerToken,
    })),
  };
}
