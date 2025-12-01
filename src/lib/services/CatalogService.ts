import { get } from "svelte/store";
import { sfts, sftMetadata } from "$lib/stores";
import { decodeSftInformation } from "$lib/decodeMetadata/helpers";
import {
  tokenMetadataTransformer,
  assetTransformer,
} from "$lib/data/transformers/sftTransformers";
import { sftRepository } from "$lib/data/repositories/sftRepository";
import authorizerAbi from "$lib/abi/authorizer.json";
import type { Hex, Abi } from "viem";
import type { Asset } from "$lib/types/uiTypes";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import type { OffchainAssetReceiptVault, MetaV1S } from "$lib/types/graphql";
import { ENERGY_FIELDS } from "$lib/network";
import { getMaxSharesSupplyMap } from "$lib/data/clients/onchain";

type DecodedMetadata = ReturnType<typeof decodeSftInformation>;

interface SftWithMetadata {
  sft: OffchainAssetReceiptVault;
  pinnedMetadata: DecodedMetadata;
  maxSupply: string;
}

/**
 * Get the most recent month from receiptsData array
 * Returns empty string if no valid receiptsData
 */
function getLatestReceiptsMonth(metadata: DecodedMetadata): string {
  const receiptsData = metadata?.asset?.receiptsData;
  if (!Array.isArray(receiptsData) || receiptsData.length === 0) {
    return "";
  }

  let latestMonth = "";
  for (const record of receiptsData) {
    const month = record?.month;
    if (typeof month === "string" && month > latestMonth) {
      latestMonth = month;
    }
  }
  return latestMonth;
}

/**
 * Select the SFT with the most recent receiptsData from a group
 * If multiple have the same latest month, pick randomly
 */
function selectSftWithMostRecentReceipts(
  group: SftWithMetadata[],
): SftWithMetadata {
  if (group.length === 1) {
    return group[0];
  }

  // Find the latest month across all metadata in the group
  let maxMonth = "";
  for (const item of group) {
    const latestMonth = getLatestReceiptsMonth(item.pinnedMetadata);
    if (latestMonth > maxMonth) {
      maxMonth = latestMonth;
    }
  }

  // Filter to only those with the most recent month
  const candidates = group.filter(
    (item) => getLatestReceiptsMonth(item.pinnedMetadata) === maxMonth,
  );

  // Pick randomly from candidates
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex];
}

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
      authorizerAbi as Abi,
    );

    const assets: Record<string, Asset> = {};
    const tokens: Record<string, TokenMetadata> = {};
    const maxSupplyByToken: Record<string, string> = {};

    // First pass: collect all SFT+metadata pairs grouped by asset ID
    const assetGroups: Record<string, SftWithMetadata[]> = {};
    const sftToAssetId: Record<string, string> = {};

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

      // Group by asset ID
      if (!assetGroups[assetId]) {
        assetGroups[assetId] = [];
      }
      assetGroups[assetId].push({ sft, pinnedMetadata, maxSupply });
      sftToAssetId[sft.id.toLowerCase()] = assetId;
    }

    // Second pass: for each asset group, select the SFT with the most recent receiptsData
    // and create the asset from that metadata
    for (const [assetId, group] of Object.entries(assetGroups)) {
      const selected = selectSftWithMostRecentReceipts(group);

      try {
        // Create asset from the selected SFT's metadata
        const assetInstance = assetTransformer.transform(
          selected.sft,
          selected.pinnedMetadata,
        );
        // Collect all token contracts for this asset
        assetInstance.tokenContracts = group.map((item) => item.sft.id);
        assets[assetId] = assetInstance;
      } catch (error) {
        console.error(
          `[CatalogService] Failed to create asset ${assetId}:`,
          error,
        );
      }
    }

    // Third pass: create all tokens
    for (const group of Object.values(assetGroups)) {
      for (const { sft, pinnedMetadata, maxSupply } of group) {
        try {
          const tokenInstance = tokenMetadataTransformer.transform(
            sft,
            pinnedMetadata,
            maxSupply,
          );
          tokens[sft.id.toLowerCase()] = tokenInstance;
          maxSupplyByToken[sft.id.toLowerCase()] = maxSupply;
        } catch (error) {
          console.error(
            `[CatalogService] Failed to process SFT ${sft.id}:`,
            error,
          );
        }
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

  /**
   * Get the shared Asset for a given token address
   */
  getAssetByTokenAddress(tokenAddress: string): Asset | null {
    if (!this.catalog) return null;

    const normalizedAddress = tokenAddress.toLowerCase();

    // Find the energy field that contains this token
    const field = ENERGY_FIELDS.find((f) =>
      f.sftTokens.some((t) => t.address.toLowerCase() === normalizedAddress),
    );

    if (!field) return null;

    // Convert field name to asset ID (kebab-case)
    const assetId = field.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    return this.catalog.assets[assetId] || null;
  }
}

export const catalogService = new CatalogService();
