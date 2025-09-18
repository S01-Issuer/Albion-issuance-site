/**
 * @fileoverview Supply Helpers
 * Helper functions to get supply information using SFT blockchain data
 * since TokenMetadata no longer contains supply fields
 */

import { get } from 'svelte/store';
import { sfts } from '$lib/stores';
import { sftRepository } from '$lib/data/repositories';
import { catalogService } from '$lib/services';
import type { TokenMetadata } from '$lib/types/MetaboardTypes';
import type { Hex } from 'viem';

export interface TokenSupplyInfo {
  maxSupply: bigint;
  mintedSupply: bigint;
  availableSupply: bigint;
  hasAvailableSupply: boolean;
}

/**
 * Get supply information for a token using on-chain SFT data
 */
export async function getTokenSupplyInfo(token: TokenMetadata): Promise<TokenSupplyInfo | null> {
  try {
    // Get SFT data
    const $sfts = get(sfts);
    let sftData = $sfts?.find(s => s.id.toLowerCase() === token.contractAddress.toLowerCase());

    if (!sftData) {
      // If not in store, try to fetch directly
      const allSfts = await sftRepository.getAllSfts();
      sftData = allSfts.find(s => s.id.toLowerCase() === token.contractAddress.toLowerCase());
    }

    if (!sftData) {
      return null;
    }

    // Get max supply from authorizer (same logic as CatalogService)
    let maxSupply: string;

    if (sftData.activeAuthorizer?.address) {
      try {
        const maxSupplyData = await sftRepository.getAuthorizerMaxSupply([sftData.activeAuthorizer.address as Hex]);
        maxSupply = maxSupplyData[sftData.activeAuthorizer.address.toLowerCase()] || sftData.totalShares;
      } catch {
        maxSupply = sftData.totalShares;
      }
    } else {
      maxSupply = sftData.totalShares;
    }

    const maxSupplyBig = BigInt(maxSupply);
    const mintedSupplyBig = BigInt(sftData.totalShares);
    const availableSupplyBig = maxSupplyBig > mintedSupplyBig ? maxSupplyBig - mintedSupplyBig : 0n;

    return {
      maxSupply: maxSupplyBig,
      mintedSupply: mintedSupplyBig,
      availableSupply: availableSupplyBig,
      hasAvailableSupply: availableSupplyBig > 0n
    };
  } catch (error) {
    console.error('Error getting token supply info:', error);
    return null;
  }
}

/**
 * Check if a token has available supply (synchronous version using store data)
 * Uses catalog service for accurate maxSupply data when available
 */
export function hasAvailableSupplySync(token: TokenMetadata): boolean {
  const $sfts = get(sfts);
  if (!$sfts) return true; // Default to available if no data

  const sft = $sfts.find(s => s.id.toLowerCase() === token.contractAddress.toLowerCase());
  if (!sft) return true; // Default to available if SFT not found

  // Try to get accurate maxSupply from catalog service
  const maxSupply = catalogService.getTokenMaxSupply(token.contractAddress);

  if (maxSupply) {
    // Use accurate calculation when maxSupply is available
    const totalShares = BigInt(sft.totalShares);
    const maxSupplyBig = BigInt(maxSupply);
    return totalShares < maxSupplyBig;
  } else {
    // Fallback heuristic: assume tokens are available unless minted supply is very high
    const totalShares = BigInt(sft.totalShares);
    const highThreshold = BigInt('1000000000000000000000000000'); // 1B tokens in wei
    return totalShares < highThreshold;
  }
}

/**
 * Format supply amount for display (using 18 decimals standard)
 */
export function formatSupplyDisplay(supplyString: string, decimals = 18): number {
  return Number(BigInt(supplyString)) / Math.pow(10, decimals);
}