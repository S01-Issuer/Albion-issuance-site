import { get } from "svelte/store";
import { sfts, sftMetadata } from "$lib/stores";
import { decodeSftInformation } from "$lib/decodeMetadata/helpers";
import {
  generateAssetInstanceFromSftMeta,
  generateTokenMetadataInstanceFromSft
} from "$lib/decodeMetadata/addSchemaToReceipts";
import authorizerAbi from "$lib/abi/authorizer.json";
import type { Hex } from "viem";
import type { Asset, Token } from "$lib/types/uiTypes";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import { ENERGY_FIELDS } from "$lib/network";
import { getMaxSharesSupplyMap } from "$lib/data/clients/onchain";

export interface CatalogData {
  assets: Record<string, Asset>;
  tokens: Record<string, TokenMetadata>;
}

export class CatalogService {
  private catalog: CatalogData | null = null;

  async build(): Promise<CatalogData> {
    const $sfts = get(sfts);
    const $sftMetadata = get(sftMetadata);

    if (!$sfts || $sfts.length === 0 || !$sftMetadata) {
      this.catalog = { assets: {}, tokens: {} };
      return this.catalog;
    }

    const decodedMeta = $sftMetadata.map((m) => decodeSftInformation(m));

    // Collect authorizer addresses for a batched read
    const authorizers: Hex[] = [] as unknown as Hex[];
    for (const sft of $sfts) {
      if (sft.activeAuthorizer?.address) {
        authorizers.push(sft.activeAuthorizer.address as Hex);
      }
    }

    const maxSupplyByAuthorizer = await getMaxSharesSupplyMap(authorizers, authorizerAbi);

    const assets: Record<string, Asset> = {};
    const tokens: Record<string, TokenMetadata> = {};

    for (const sft of $sfts) {
      const pinnedMetadata: any = decodedMeta.find(
        (meta: any) => meta?.contractAddress === `0x000000000000000000000000${sft.id.slice(2)}`
      );
      if (!pinnedMetadata) continue;

      const authAddress = (sft.activeAuthorizer?.address || "0x").toLowerCase();
      const maxSupply = maxSupplyByAuthorizer[authAddress] || "0";

      const tokenInstance = generateTokenMetadataInstanceFromSft(
        sft,
        pinnedMetadata,
        maxSupply
      );
      const assetInstance = generateAssetInstanceFromSftMeta(sft, pinnedMetadata);

      tokens[sft.id.toLowerCase()] = tokenInstance;
      // Asset ID canonicalization via ENERGY_FIELDS name → kebab-case (consistent with existing pages)
      const field = ENERGY_FIELDS.find((f) =>
        f.sftTokens.some((t) => t.address.toLowerCase() === sft.id.toLowerCase())
      );
      const assetId = field
        ? field.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        : (assetInstance.id || sft.id.toLowerCase());
      assets[assetId] = assetInstance as Asset;
    }

    this.catalog = { assets, tokens };
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

