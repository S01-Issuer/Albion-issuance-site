/**
 * @fileoverview Asset detail data composable
 * Manages data loading for asset detail pages using focused services
 */

import { writable, type Writable, get } from "svelte/store";
import { readContract } from "@wagmi/core";
import { wagmiConfig } from "svelte-wagmi";
import { sftMetadata, sfts } from "$lib/stores";
import { decodeSftInformation } from "$lib/decodeMetadata/helpers";
import {
  generateAssetInstanceFromSftMeta,
  generateTokenInstanceFromSft,
  generateTokenMetadataInstanceFromSft,
} from "$lib/decodeMetadata/addSchemaToReceipts";
import authorizerAbi from "$lib/abi/authorizer.json";
import type { Hex } from "viem";
import type { MetaV1S } from "$lib/types/sftMetadataTypes";
import type { OffchainAssetReceiptVault } from "$lib/types/offchainAssetReceiptVaultTypes";
import type { Asset, Token } from "$lib/types/uiTypes";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import { ENERGY_FIELDS, type SftToken } from "$lib/network";

interface AssetDetailState {
  asset: Asset | null;
  tokens: TokenMetadata[];
  loading: boolean;
  error: string | null;
}

/**
 * Composable for managing asset detail data
 */
export function useAssetDetailData(initialEnergyFieldId: string) {
  // State management
  const state: Writable<AssetDetailState> = writable({
    asset: null,
    tokens: [],
    loading: true,
    error: null,
  });

  // Load asset and related data for an energy field
  async function loadAssetData(energyFieldId?: string) {
    const id = energyFieldId || initialEnergyFieldId;

    state.update((s) => ({ ...s, loading: true, error: null }));

    try {
      const currentSftMetadata = get(sftMetadata);
      const currentSfts = get(sfts);
      const currentWagmiConfig = get(wagmiConfig);

      if (!currentSftMetadata || !currentSfts) {
        throw new Error("SFT data not available");
      }

      const decodedMeta = currentSftMetadata.map((metaV1: MetaV1S) =>
        decodeSftInformation(metaV1),
      );

      // Find the energy field by ID
      const energyField = ENERGY_FIELDS.find((field: any) => {
        const fieldId = field.name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        return fieldId === id;
      });

      if (!energyField) {
        throw new Error("Energy field not found");
      }

      // Find all SFTs that belong to this energy field
      const energyFieldSfts = currentSfts.filter(
        (sft: OffchainAssetReceiptVault) =>
          energyField.sftTokens.some(
            (token: SftToken) =>
              token.address.toLowerCase() === sft.id.toLowerCase(),
          ),
      );

      if (energyFieldSfts.length === 0) {
        throw new Error("No SFTs found for this energy field");
      }

      // Load all tokens for this energy field
      const tokens: TokenMetadata[] = [];
      let assetInstance: Asset | null = null;

      for (const sft of energyFieldSfts) {
        const pinnedMetadata: any = decodedMeta.find(
          (meta: any) =>
            meta?.contractAddress ===
            `0x000000000000000000000000${sft.id.slice(2)}`,
        );

        if (pinnedMetadata) {
          try {
            const sftMaxSharesSupply = (await readContract(currentWagmiConfig, {
              abi: authorizerAbi,
              address: sft.activeAuthorizer?.address as Hex,
              functionName: "maxSharesSupply",
              args: [],
            })) as bigint;

            const tokenInstance = generateTokenMetadataInstanceFromSft(
              sft,
              pinnedMetadata,
              sftMaxSharesSupply.toString(),
            );
            tokens.push(tokenInstance);

            // Use the first token's asset instance (they should all be the same)
            if (!assetInstance) {
              assetInstance = generateAssetInstanceFromSftMeta(
                sft,
                pinnedMetadata,
              );
            }
          } catch (error) {
            console.error(`Failed to load token data for SFT ${sft.id}:`, error);
            // Continue with next token instead of breaking the entire load
          }
        }
      }

      if (tokens.length === 0) {
        throw new Error("No tokens found for this energy field");
      }

      if (!assetInstance) {
        throw new Error("Asset data not found");
      }

      state.update((s) => ({
        ...s,
        asset: assetInstance,
        tokens,
        loading: false,
      }));
    } catch (err) {
      console.error(err);
      state.update((s) => ({
        ...s,
        error:
          err instanceof Error
            ? err.message
            : "Failed to load energy field data",
        loading: false,
      }));
    }
  }

  // Get latest monthly report
  function getLatestReport(energyFieldId?: string) {
    const id = energyFieldId || initialEnergyFieldId;
    // This should now return data from the SFT asset instance
    const currentState = get(state);
    if (
      currentState.asset?.monthlyReports &&
      currentState.asset.monthlyReports.length > 0
    ) {
      return currentState.asset.monthlyReports[
        currentState.asset.monthlyReports.length - 1
      ];
    }
    return null;
  }

  // Get average monthly revenue
  function getAverageRevenue(energyFieldId?: string) {
    const id = energyFieldId || initialEnergyFieldId;
    // This should now calculate from SFT asset data
    const currentState = get(state);
    if (
      currentState.asset?.monthlyReports &&
      currentState.asset.monthlyReports.length > 0
    ) {
      const totalRevenue = currentState.asset.monthlyReports.reduce(
        (sum, report) => sum + (report.revenue || 0),
        0,
      );
      return totalRevenue / currentState.asset.monthlyReports.length;
    }
    return 0;
  }

  // Get production timeline
  function getProductionTimeline(energyFieldId?: string) {
    const id = energyFieldId || initialEnergyFieldId;
    // This should now return data from the SFT asset instance
    const currentState = get(state);
    return currentState.asset?.monthlyReports || [];
  }

  // Check if token is available
  function isTokenAvailable(tokenAddress: string) {
    const currentState = get(state);
    const token = currentState.tokens.find(
      (t) => t.contractAddress.toLowerCase() === tokenAddress.toLowerCase(),
    );
    if (token) {
      return BigInt(token.supply.maxSupply) > BigInt(token.supply.mintedSupply);
    }
    return false;
  }

  // Get token payout history
  function getTokenPayoutHistory(tokenAddress: string) {
    const currentState = get(state);
    const token = currentState.tokens.find(
      (t) => t.contractAddress.toLowerCase() === tokenAddress.toLowerCase(),
    );
    return token?.payoutData || []; // Use payoutData from TokenMetadata
  }

  // Refresh data
  async function refresh(assetId?: string) {
    await loadAssetData(assetId);
  }

  return {
    state,
    loadAssetData,
    getLatestReport,
    getAverageRevenue,
    getProductionTimeline,
    isTokenAvailable,
    getTokenPayoutHistory,
    refresh,
  };
}
