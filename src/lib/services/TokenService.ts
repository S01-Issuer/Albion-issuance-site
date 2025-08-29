/**
 * @fileoverview Token Service
 * Handles token-related data operations and business logic
 *
 * Responsibilities:
 * - Load and manage token data from IPFS
 * - Token-specific transformations
 * - Token-related calculations
 *
 * Dependencies:
 * - Stores for IPFS data
 * - TransformService for data transformation
 */

import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import type { Token } from "$lib/types/uiTypes";
import { TypeTransformations } from "$lib/types/transformations";
import {
  getTokenReturns,
  type TokenReturns,
} from "$lib/utils/returnCalculations";
import assetService from "./AssetService";
import { get } from "svelte/store";
import { sfts, sftMetadata } from "$lib/stores";
import { decodeSftInformation } from "$lib/decodeMetadata/helpers";
import { generateTokenMetadataInstanceFromSft } from "$lib/decodeMetadata/addSchemaToReceipts";
import { readContract } from "@wagmi/core";
import { wagmiConfig } from "svelte-wagmi";
import authorizerAbi from "$lib/abi/authorizer.json";
import type { Hex } from "viem";
import { ENERGY_FIELDS } from "$lib/network";

interface TokenMetadataMap {
  [tokenAddress: string]: TokenMetadata;
}

class TokenService {
  private tokenCache: Map<string, Token> = new Map();
  private tokenMetadataCache: Map<string, TokenMetadata> = new Map();
  private allTokens: Token[] | null = null;

  constructor() {
    // Service now loads data dynamically from stores
  }

  /**
   * Load tokens from IPFS data in stores
   */
  private async loadTokensFromStores(): Promise<TokenMetadata[]> {
    const $sfts = get(sfts);
    const $sftMetadata = get(sftMetadata);
    
    if (!$sfts || $sfts.length === 0 || !$sftMetadata) {
      return [];
    }

    const tokens: TokenMetadata[] = [];
    const decodedMeta = $sftMetadata.map((metaV1) => decodeSftInformation(metaV1));
    
    for (const sft of $sfts) {
      const pinnedMetadata = decodedMeta.find(
        (meta) => meta?.contractAddress === `0x000000000000000000000000${sft.id.slice(2)}`
      );
      
      if (pinnedMetadata) {
        try {
          const $wagmiConfig = get(wagmiConfig);
          const sftMaxSharesSupply = await readContract($wagmiConfig, {
            abi: authorizerAbi,
            address: sft.activeAuthorizer?.address as Hex,
            functionName: 'maxSharesSupply',
            args: []
          }) as bigint;
          
          const tokenInstance = generateTokenMetadataInstanceFromSft(sft, pinnedMetadata, sftMaxSharesSupply.toString());
          tokens.push(tokenInstance);
          
          // Cache both the full metadata and UI token
          this.tokenMetadataCache.set(sft.id.toLowerCase(), tokenInstance);
          const uiToken = TypeTransformations.tokenToUI(tokenInstance);
          this.tokenCache.set(sft.id.toLowerCase(), uiToken);
        } catch (error) {
          console.error(`Failed to load token ${sft.id}:`, error);
        }
      }
    }
    
    return tokens;
  }


  /**
   * Synchronous wrappers for backward compatibility
   * These will trigger async loads but return cached data
   */
  getTokenByAddress(tokenAddress: string): Token | null {
    // Trigger async load in background
    this.getTokenByAddressAsync(tokenAddress);
    return this.tokenCache.get(tokenAddress.toLowerCase()) || null;
  }
  
  private async getTokenByAddressAsync(tokenAddress: string): Promise<Token | null> {
    // Check cache first
    const cached = this.tokenCache.get(tokenAddress.toLowerCase());
    if (cached) {
      return cached;
    }
    
    // Reload and check again
    await this.loadTokensFromStores();
    return this.tokenCache.get(tokenAddress.toLowerCase()) || null;
  }
  
  getTokensByEnergyField(energyFieldName: string): Token[] {
    // Find the energy field
    const field = ENERGY_FIELDS.find(f => f.name === energyFieldName);
    if (!field) return [];
    
    // Return tokens that belong to this energy field
    const tokens = Array.from(this.tokenCache.values());
    return tokens.filter(token => 
      field.sftTokens.some(addr => addr.toLowerCase() === token.contractAddress.toLowerCase())
    );
  }
  
  private async getTokensByEnergyFieldAsync(energyFieldName: string): Promise<Token[]> {
    const tokens = await this.getAllTokensAsync();
    const field = ENERGY_FIELDS.find(f => f.name === energyFieldName);
    if (!field) return [];
    
    return tokens.filter(token => 
      field.sftTokens.some(addr => addr.toLowerCase() === token.contractAddress.toLowerCase())
    );
  }
  
  getAllTokens(): Token[] {
    // Trigger async load in background
    this.getAllTokensAsync();
    return Array.from(this.tokenCache.values());
  }
  
  private async getAllTokensAsync(): Promise<Token[]> {
    // Always reload from stores to get latest data
    const tokenMetadataList = await this.loadTokensFromStores();
    this.allTokens = tokenMetadataList.map((tokenData) =>
      TypeTransformations.tokenToUI(tokenData)
    );
    return this.allTokens;
  }

  /**
   * Get energy field name for a token
   */
  getEnergyFieldForToken(tokenAddress: string): string | null {
    const field = ENERGY_FIELDS.find(f => 
      f.sftTokens.some(addr => addr.toLowerCase() === tokenAddress.toLowerCase())
    );
    return field?.name || null;
  }

  /**
   * Calculate token returns
   */
  getTokenReturns(tokenAddress: string): TokenReturns | null {
    const token = this.getTokenByAddress(tokenAddress);
    if (!token) {
      return null;
    }

    // Get associated asset for calculations
    const energyFieldName = this.getEnergyFieldForToken(tokenAddress);
    if (!energyFieldName) {
      return null;
    }

    const assetId = energyFieldName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const asset = assetService.getAssetById(assetId);
    if (!asset) {
      return null;
    }

    return getTokenReturns(asset, token);
  }

  /**
   * Get tokens by type
   */
  getTokensByType(tokenType: string): Token[] {
    const tokens = this.getAllTokens();
    return tokens.filter((token) => token.tokenType === tokenType);
  }

  /**
   * Get available tokens (not sold out)
   */
  getAvailableTokens(): Token[] {
    const tokens = this.getAllTokens();
    return tokens.filter(
      (token) =>
        token.isActive &&
        token.supply &&
        BigInt(token.supply.maxSupply) - BigInt(token.supply.mintedSupply) > 0n,
    );
  }

  /**
   * Get token metadata by address
   */
  async getTokenMetadataByAddress(tokenAddress: string): Promise<TokenMetadata | null> {
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Check cache first
    const cached = this.tokenMetadataCache.get(normalizedAddress);
    if (cached) {
      return cached;
    }
    
    // Load if not cached
    await this.loadTokensFromStores();
    return this.tokenMetadataCache.get(normalizedAddress) || null;
  }

  /**
   * Search tokens by name or symbol
   */
  searchTokens(query: string): Token[] {
    if (!query.trim()) {
      return this.getAllTokens();
    }

    const lowercaseQuery = query.toLowerCase();
    const tokens = this.getAllTokens();

    return tokens.filter(
      (token) =>
        token.name?.toLowerCase().includes(lowercaseQuery) ||
        token.symbol?.toLowerCase().includes(lowercaseQuery),
    );
  }

  /**
   * Get token supply information
   */
  getTokenSupply(tokenAddress: string): {
    total: number;
    available: number;
    sold: number;
    percentageSold: number;
  } | null {
    const token = this.getTokenByAddress(tokenAddress);
    if (!token?.supply) {
      return null;
    }

    const maxSupply = BigInt(token.supply.maxSupply);
    const mintedSupply = BigInt(token.supply.mintedSupply);
    const availableSupply = maxSupply - mintedSupply;

    const total = Number(maxSupply) / Math.pow(10, token.decimals);
    const available = Number(availableSupply) / Math.pow(10, token.decimals);
    const sold = Number(mintedSupply) / Math.pow(10, token.decimals);
    const percentageSold = total > 0 ? (sold / total) * 100 : 0;

    return {
      total,
      available,
      sold,
      percentageSold,
    };
  }

  /**
   * Check if token is available for purchase
   */
  isTokenAvailable(tokenAddress: string): boolean {
    const token = this.getTokenByAddress(tokenAddress);
    if (!token || !token.supply) {
      return false;
    }

    const availableSupply =
      BigInt(token.supply.maxSupply) - BigInt(token.supply.mintedSupply);
    return token.isActive && availableSupply > 0n;
  }

  /**
   * Get token payout history
   */
  getTokenPayoutHistory(tokenAddress: string): { recentPayouts: any[] } | null {
    const token = this.getTokenByAddress(tokenAddress);
    if (!token || !token.payoutHistory) {
      return null;
    }

    return {
      recentPayouts: token.payoutHistory.map((payout) => ({
        month: payout.month,
        totalPayout: payout.totalPayout,
        payoutPerToken: payout.payoutPerToken,
      })),
    };
  }

  /**
   * Clear cache - useful for testing or data refresh
   */
  clearCache(): void {
    this.allTokens = null;
    this.tokenCache.clear();
    this.tokenMetadataCache.clear();
  }
}

// Export singleton instance
const tokenService = new TokenService();
export default tokenService;
