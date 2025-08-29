/**
 * @fileoverview Asset Service
 * Handles asset-related data operations and business logic
 *
 * Responsibilities:
 * - Load and manage asset data from IPFS
 * - Asset-specific transformations
 * - Asset-related calculations
 *
 * Dependencies:
 * - Stores for IPFS data
 * - TransformService for data transformation
 */

import type { AssetData, ReceiptsData } from "$lib/types/MetaboardTypes";
import type { Asset } from "$lib/types/uiTypes";
import { TypeTransformations } from "$lib/types/transformations";
import type { ISODateOnlyString } from "$lib/types/sharedTypes";
import { arrayUtils } from "$lib/utils/arrayHelpers";
import { get } from "svelte/store";
import { sfts, sftMetadata } from "$lib/stores";
import { decodeSftInformation } from "$lib/decodeMetadata/helpers";
import { generateAssetInstanceFromSftMeta } from "$lib/decodeMetadata/addSchemaToReceipts";

interface AssetMetadataMap {
  [assetId: string]: Asset;
}

class AssetService {
  private assetCache: AssetMetadataMap = {};
  private allAssets: Asset[] | null = null;

  constructor() {
    // Service now loads data dynamically from stores
  }

  /**
   * Load assets from IPFS data in stores
   */
  private loadAssetsFromStores(): Asset[] {
    const $sfts = get(sfts);
    const $sftMetadata = get(sftMetadata);
    
    if (!$sfts || $sfts.length === 0 || !$sftMetadata) {
      return [];
    }

    const assets: Asset[] = [];
    const decodedMeta = $sftMetadata.map((metaV1) => decodeSftInformation(metaV1));
    
    for (const sft of $sfts) {
      const pinnedMetadata = decodedMeta.find(
        (meta) => meta?.contractAddress === `0x000000000000000000000000${sft.id.slice(2)}`
      );
      
      if (pinnedMetadata && pinnedMetadata.asset) {
        try {
          const assetInstance = generateAssetInstanceFromSftMeta(sft, pinnedMetadata);
          assets.push(assetInstance);
          // Cache by asset ID
          this.assetCache[assetInstance.id] = assetInstance;
        } catch (error) {
          console.error(`Failed to load asset for SFT ${sft.id}:`, error);
          // Continue with next asset instead of breaking the entire load
        }
      }
    }
    
    return assets;
  }

  /**
   * Get all assets in UI format
   */
  getAllAssets(): Asset[] {
    // Always reload from stores to get latest data
    this.allAssets = this.loadAssetsFromStores();
    return this.allAssets;
  }

  /**
   * Clear cache - useful for development
   */
  clearCache() {
    this.allAssets = null;
    this.assetCache = {};
  }

  /**
   * Get asset by ID
   */
  getAssetById(assetId: string): Asset | null {
    // First check cache
    if (this.assetCache[assetId]) {
      return this.assetCache[assetId];
    }
    
    // Reload from stores if not in cache
    this.loadAssetsFromStores();
    
    const asset = this.assetCache[assetId];
    if (!asset) {
      console.warn(`Asset with ID ${assetId} not found`);
      return null;
    }

    return asset;
  }

  // Note: Most methods removed as they were unused.
  // Only keeping getAssetById which is used by TokenService
}

// Export singleton instance
const assetService = new AssetService();
export default assetService;