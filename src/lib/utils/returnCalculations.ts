/**
 * Return calculation utilities for royalty tokens
 * Based on planned production data and token supply metrics
 */

import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import type { Asset } from "$lib/types/uiTypes";
import type { OffchainAssetReceiptVault } from "$lib/types/graphql";

export interface TokenReturns {
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
 * Calculate token metrics based on planned production and token supply
 * @param asset Asset data containing planned production
 * @param token Token data containing supply and share percentage
 * @param onChainMintedSupply Optional on-chain minted supply (in wei)
 * @returns Calculated metrics
 */
export function calculateTokenReturns(
  asset: Asset,
  token: TokenMetadata,
  onChainMintedSupply?: string,
  _maxSupply?: string,
): TokenReturns {
  if (!asset.plannedProduction || !token.sharePercentage) {
    console.warn(
      `[Returns] Missing data for ${token.symbol}: plannedProduction=${!!asset.plannedProduction}, sharePercentage=${token.sharePercentage}`,
    );
    return {
      impliedBarrelsPerToken: 0,
      breakEvenOilPrice: 0,
    };
  }

  const { plannedProduction } = asset;
  const { projections } = plannedProduction;
  const sharePercentage = token.sharePercentage / 100; // Convert to decimal

  if (!projections || projections.length === 0) {
    console.warn(`[Returns] No projections for ${token.symbol}`);
    return {
      impliedBarrelsPerToken: 0,
      breakEvenOilPrice: 0,
    };
  }

  // ALWAYS use on-chain minted supply for accurate calculation
  // Never trust IPFS metadata for minted supply as it's not updated in real-time
  let mintedSupply: number;
  if (onChainMintedSupply) {
    // On-chain value is in wei, convert to token units
    try {
      mintedSupply = Number(BigInt(onChainMintedSupply) / BigInt(10 ** 18));
    } catch {
      // If BigInt conversion fails, default to 0
      mintedSupply = 0;
    }
  } else {
    // No on-chain data provided, default to 0
    mintedSupply = 0;
  }

  // Calculate total production
  let totalProduction = 0;
  for (const projection of projections) {
    totalProduction += projection.production;
  }

  // Calculate implied barrels per $1 token
  // This represents how many barrels of oil each $1 investment in the token represents
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
