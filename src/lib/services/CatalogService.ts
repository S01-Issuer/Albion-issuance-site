import { get } from "svelte/store";
import { sfts, sftMetadata } from "$lib/stores";
import { decodeSftInformation } from "$lib/decodeMetadata/helpers";
import { tokenMetadataTransformer, assetTransformer } from "$lib/data/transformers/sftTransformers";
import { sftRepository } from "$lib/data/repositories/sftRepository";
import authorizerAbi from "$lib/abi/authorizer.json";
import type { Hex } from "viem";
import type { Asset } from "$lib/types/uiTypes";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import type { OffchainAssetReceiptVault as GraphQLVault, MetaV1S } from "$lib/types/graphql";
import { ENERGY_FIELDS } from "$lib/network";
import { getMaxSharesSupplyMap } from "$lib/data/clients/onchain";

export interface CatalogData {
  assets: Record<string, Asset>;
  tokens: Record<string, TokenMetadata>;
}

export class CatalogService {
  private catalog: CatalogData | null = null;
  private buildPromise: Promise<CatalogData> | null = null;
  private lastBuildHash: string | null = null;

  private computeDataHash(sftsData: any[], metaData: any[]): string {
    // Simple hash to detect data changes
    return JSON.stringify({
      sftsCount: sftsData?.length || 0,
      metaCount: metaData?.length || 0,
      sftsIds: sftsData?.map(s => s.id).sort().join(',') || '',
      metaIds: metaData?.map(m => m.subject).sort().join(',') || ''
    });
  }

  /**
   * Build catalog from stores or fetch fresh data
   */
  async build(): Promise<CatalogData> {
    // If a build is already in progress, return that promise
    if (this.buildPromise) {
      console.log('[CatalogService] Build already in progress, returning existing promise');
      return this.buildPromise;
    }

    // Try to use store data first
    let $sfts = get(sfts);
    let $sftMetadata = get(sftMetadata);

    // If stores are empty, fetch from repository
    if (!$sfts || $sfts.length === 0) {
      console.log('[CatalogService] Stores empty, fetching from repository');
      const fetchedSfts = await sftRepository.getAllSfts();
      // Convert GraphQL type to store type (they're compatible for our usage)
      $sfts = fetchedSfts as any;
      console.log(`[CatalogService] Fetched ${$sfts.length} SFTs from repository`);
      sfts.set($sfts);
    } else {
      console.log(`[CatalogService] Using ${$sfts.length} SFTs from stores`);
    }

    if (!$sftMetadata || $sftMetadata.length === 0) {
      console.log('[CatalogService] Metadata empty, fetching from repository');
      const fetchedMetadata = await sftRepository.getSftMetadata();
      $sftMetadata = fetchedMetadata as any;
      console.log(`[CatalogService] Fetched ${$sftMetadata.length} metadata entries from repository`);
      sftMetadata.set($sftMetadata);
    } else {
      console.log(`[CatalogService] Using ${$sftMetadata.length} metadata entries from stores`);
    }

    // Check if data has changed
    const currentHash = this.computeDataHash($sfts, $sftMetadata || []);
    if (this.catalog && this.lastBuildHash === currentHash) {
      console.log('[CatalogService] Data unchanged, returning cached catalog');
      return this.catalog;
    }

    console.log('[CatalogService] Starting new catalog build');
    
    // Start new build
    this.buildPromise = this._buildInternal($sfts, $sftMetadata || [], currentHash);
    
    try {
      const result = await this.buildPromise;
      return result;
    } finally {
      this.buildPromise = null;
    }
  }

  private async _buildInternal(
    $sfts: any[],
    $sftMetadata: any[],
    currentHash: string
  ): Promise<CatalogData> {
    if (!$sfts || $sfts.length === 0 || !$sftMetadata) {
      this.catalog = { assets: {}, tokens: {} };
      this.lastBuildHash = currentHash;
      return this.catalog;
    }

    // Decode metadata
    console.log(`[CatalogService] Raw metadata entries:`, $sftMetadata.length);
    if ($sftMetadata.length > 0) {
      console.log(`[CatalogService] First raw metadata entry:`, $sftMetadata[0]);
    }
    const decodedMeta = $sftMetadata.map((m) => decodeSftInformation(m));
    console.log(`[CatalogService] Decoded ${decodedMeta.length} metadata entries`);
    if (decodedMeta.length > 0 && decodedMeta[0]) {
      console.log(`[CatalogService] First decoded metadata contractAddress:`, decodedMeta[0].contractAddress);
    }

    // Collect authorizer addresses for max supply lookup
    const authorizers: Hex[] = [];
    for (const sft of $sfts) {
      if (sft.activeAuthorizer?.address) {
        authorizers.push(sft.activeAuthorizer.address as Hex);
      }
    }

    console.log(`[CatalogService] Reading max supply from ${authorizers.length} authorizers`);
    
    // Read max supply from authorizers using multicall
    const maxSupplyByAuthorizer = await getMaxSharesSupplyMap(authorizers, authorizerAbi);

    const assets: Record<string, Asset> = {};
    const tokens: Record<string, TokenMetadata> = {};

    for (const sft of $sfts) {
      const targetAddress = `0x000000000000000000000000${sft.id.slice(2)}`;
      const pinnedMetadata = decodedMeta.find(
        (meta: any) => {
          const matches = meta?.contractAddress === targetAddress;
          if (!matches && sft.id === '0xf836a500910453a397084ade41321ee20a5aade1') {
            console.log(`[CatalogService] Wressle matching debug:`);
            console.log(`  Looking for: ${targetAddress}`);
            console.log(`  Found: ${meta?.contractAddress}`);
          }
          return matches;
        }
      );
      if (!pinnedMetadata) {
        console.log(`[CatalogService] No metadata found for SFT ${sft.id}`);
        continue;
      }

      // Get max supply
      const authAddress = (sft.activeAuthorizer?.address || "").toLowerCase();
      let maxSupply = maxSupplyByAuthorizer[authAddress];
      
      console.log(`[CatalogService] Token ${sft.symbol}: authorizer ${authAddress}, maxSupply from chain: ${maxSupply}, totalShares: ${sft.totalShares}`);
      
      if (!maxSupply || maxSupply === "0") {
        // Fallback to totalShares if authorizer doesn't have max supply
        maxSupply = sft.totalShares;
        console.log(`[CatalogService] Using totalShares as max supply for ${sft.id}: ${maxSupply}`);
      }

      // Use transformers to create instances
      try {
        const tokenInstance = tokenMetadataTransformer.transform(sft, pinnedMetadata, maxSupply);
        tokens[sft.id.toLowerCase()] = tokenInstance;
        
        // Asset ID canonicalization via ENERGY_FIELDS name → kebab-case
        const field = ENERGY_FIELDS.find((f) =>
          f.sftTokens.some((t) => t.address.toLowerCase() === sft.id.toLowerCase())
        );
        const assetId = field
          ? field.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
          : sft.id.toLowerCase();
        
        // Check if asset already exists (multiple tokens for same field)
        if (assets[assetId]) {
          // Add this token to the existing asset's tokenContracts
          if (!assets[assetId].tokenContracts.includes(sft.id)) {
            assets[assetId].tokenContracts.push(sft.id);
          }
        } else {
          // Create new asset instance
          const assetInstance = assetTransformer.transform(sft, pinnedMetadata);
          assets[assetId] = assetInstance;
        }
      } catch (error) {
        console.error(`[CatalogService] Failed to process SFT ${sft.id}:`, error);
        continue;
      }
    }

    this.catalog = { assets, tokens };
    this.lastBuildHash = currentHash;
    console.log(`[CatalogService] Build complete: ${Object.keys(assets).length} assets, ${Object.keys(tokens).length} tokens`);
    return this.catalog;
  }

  getCatalog(): CatalogData | null {
    return this.catalog;
  }

  getAllAssets(): Asset[] {
    if (!this.catalog) return [];
    return Object.values(this.catalog.assets);
  }

  getAllTokens(): TokenMetadata[] {
    if (!this.catalog) return [];
    return Object.values(this.catalog.tokens);
  }

  getAssetById(assetId: string): Asset | null {
    if (!this.catalog) return null;
    return this.catalog.assets[assetId] || null;
  }

  getTokensByEnergyField(fieldName: string): TokenMetadata[] {
    if (!this.catalog) return [];
    const field = ENERGY_FIELDS.find((f) => f.name === fieldName);
    if (!field) return [];
    return Object.values(this.catalog.tokens).filter((t) =>
      field.sftTokens.some((s) => s.address.toLowerCase() === t.contractAddress.toLowerCase())
    );
  }
}

export const catalogService = new CatalogService();

