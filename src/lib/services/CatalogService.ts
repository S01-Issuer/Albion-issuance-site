import { get } from "svelte/store";
import { sfts, sftMetadata } from "$lib/stores";
import { decodeSftInformation } from "$lib/decodeMetadata/helpers";
import {
  tokenMetadataTransformer,
  assetTransformer,
} from "$lib/data/transformers/sftTransformers";
import { sftRepository } from "$lib/data/repositories/sftRepository";
import authorizerAbi from "$lib/abi/authorizer.json";
import type { Hex } from "viem";
import type { Asset } from "$lib/types/uiTypes";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import type { OffchainAssetReceiptVault, MetaV1S } from "$lib/types/graphql";
import { ENERGY_FIELDS } from "$lib/network";
import { getMaxSharesSupplyMap } from "$lib/data/clients/onchain";

type DecodedMetadata = ReturnType<typeof decodeSftInformation>;

export interface CatalogData {
  assets: Record<string, Asset>;
  tokens: Record<string, TokenMetadata>;
  maxSupplyByToken: Record<string, string>; // token address -> max supply
}

export class CatalogService {
  private catalog: CatalogData | null = null;
  private buildPromise: Promise<CatalogData> | null = null;
  private lastBuildHash: string | null = null;

  private computeDataHash(
    sftsData: ReadonlyArray<{ id: string }> | null | undefined,
    metaData: ReadonlyArray<{ subject?: string }> | null | undefined,
  ): string {
    // Simple hash to detect data changes
    return JSON.stringify({
      sftsCount: sftsData?.length || 0,
      metaCount: metaData?.length || 0,
      sftsIds:
        sftsData
          ?.map((s) => s.id)
          .sort()
          .join(",") || "",
      metaIds:
        metaData
          ?.map((m) => m.subject)
          .sort()
          .join(",") || "",
    });
  }

  /**
   * Build catalog from stores or fetch fresh data
   */
  async build(): Promise<CatalogData> {
    // If a build is already in progress, return that promise
    if (this.buildPromise) {
      return this.buildPromise;
    }

    // Try to use store data first
    let $sfts = (get(sfts) ?? []) as OffchainAssetReceiptVault[];
    let $sftMetadataRaw = (get(sftMetadata) ?? []) as MetaV1S[];

    // If stores are null or empty, fetch from repository
    // Check for null explicitly to distinguish "not loaded" from "loaded but empty"
    if (!Array.isArray($sfts) || $sfts.length === 0) {
      const fetchedSfts = await sftRepository.getAllSfts();
      $sfts = fetchedSfts;
      sfts.set(fetchedSfts);
    }

    if (!Array.isArray($sftMetadataRaw) || $sftMetadataRaw.length === 0) {
      const fetchedMetadata = await sftRepository.getSftMetadata();
      $sftMetadataRaw = fetchedMetadata;
      sftMetadata.set(fetchedMetadata);
    }

    // Check if data has changed
    const currentHash = this.computeDataHash($sfts, $sftMetadataRaw);
    if (this.catalog && this.lastBuildHash === currentHash) {
      return this.catalog;
    }

    // Start new build
    this.buildPromise = this._buildInternal(
      $sfts,
      $sftMetadataRaw,
      currentHash,
    );

    try {
      const result = await this.buildPromise;
      return result;
    } finally {
      this.buildPromise = null;
    }
  }

  private async _buildInternal(
    $sfts: OffchainAssetReceiptVault[],
    $sftMetadata: MetaV1S[],
    currentHash: string,
  ): Promise<CatalogData> {
    if (
      !Array.isArray($sfts) ||
      $sfts.length === 0 ||
      !Array.isArray($sftMetadata)
    ) {
      this.catalog = { assets: {}, tokens: {}, maxSupplyByToken: {} };
      this.lastBuildHash = currentHash;
      return this.catalog;
    }

    // Decode metadata
    const decodedMeta: DecodedMetadata[] = $sftMetadata.map((meta) =>
      decodeSftInformation(meta),
    );

    // Collect authorizer addresses for max supply lookup
    const authorizers: Hex[] = [];
    for (const sft of $sfts) {
      if (sft.activeAuthorizer?.address) {
        authorizers.push(sft.activeAuthorizer.address as Hex);
      }
    }

    // Read max supply from authorizers using multicall
    const maxSupplyByAuthorizer = await getMaxSharesSupplyMap(
      authorizers,
      authorizerAbi,
    );

    const assets: Record<string, Asset> = {};
    const tokens: Record<string, TokenMetadata> = {};
    const maxSupplyByToken: Record<string, string> = {};

    for (const sft of $sfts) {
      const targetAddress = `0x000000000000000000000000${sft.id.slice(2)}`;
      const pinnedMetadata = decodedMeta.find(
        (meta) => meta?.contractAddress === targetAddress,
      );
      if (!pinnedMetadata) {
        continue;
      }

      // Get max supply
      const authAddress = (sft.activeAuthorizer?.address || "").toLowerCase();
      let maxSupply = maxSupplyByAuthorizer[authAddress];

      if (!maxSupply || maxSupply === "0") {
        // Fallback to totalShares if authorizer doesn't have max supply
        maxSupply = sft.totalShares;
      }

      // Use transformers to create instances
      try {
        const tokenInstance = tokenMetadataTransformer.transform(
          sft,
          pinnedMetadata,
          maxSupply,
        );
        tokens[sft.id.toLowerCase()] = tokenInstance;
        maxSupplyByToken[sft.id.toLowerCase()] = maxSupply;

        // Asset ID canonicalization via ENERGY_FIELDS name → kebab-case
        const field = ENERGY_FIELDS.find((f) =>
          f.sftTokens.some(
            (t) => t.address.toLowerCase() === sft.id.toLowerCase(),
          ),
        );
        const assetId = field
          ? field.name
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9-]/g, "")
          : sft.id.toLowerCase();

        // Check if asset already exists (multiple tokens for same field)
        const existingAsset = assets[assetId];
        if (existingAsset) {
          // Add this token to the existing asset's tokenContracts
          existingAsset.tokenContracts = existingAsset.tokenContracts || [];
          if (!existingAsset.tokenContracts.includes(sft.id)) {
            existingAsset.tokenContracts.push(sft.id);
          }
        } else {
          // Create new asset instance
          const assetInstance = assetTransformer.transform(sft, pinnedMetadata);
          assets[assetId] = assetInstance;
        }
      } catch (error) {
        console.error(
          `[CatalogService] Failed to process SFT ${sft.id}:`,
          error,
        );
        continue;
      }
    }

    this.catalog = { assets, tokens, maxSupplyByToken };
    this.lastBuildHash = currentHash;
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
      field.sftTokens.some(
        (s) => s.address.toLowerCase() === t.contractAddress.toLowerCase(),
      ),
    );
  }

  /**
   * Get max supply for a token from authorizer data
   */
  getTokenMaxSupply(tokenAddress: string): string | null {
    if (!this.catalog) return null;
    return this.catalog.maxSupplyByToken[tokenAddress.toLowerCase()] || null;
  }
}

export const catalogService = new CatalogService();
