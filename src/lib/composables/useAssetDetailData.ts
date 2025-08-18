/**
 * @fileoverview Asset detail data composable
 * Manages data loading for asset detail pages using focused services
 */

import { writable, type Writable, get } from "svelte/store";
import { sftMetadata, sfts } from "$lib/stores";
import type { Asset, Token } from "$lib/types/uiTypes";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import { ENERGY_FIELDS, type SftToken } from "$lib/network";
import { useCatalogService } from "$lib/services";

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
      const catalog = useCatalogService();
      await catalog.build();

      // Find field by ID and collect tokens from catalog
      const field = ENERGY_FIELDS.find((f) => (
        f.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') === id
      ));
      if (!field) throw new Error("Energy field not found");

      const allTokens = Object.values(catalog.getCatalog()?.tokens || {});
      const fieldTokens: TokenMetadata[] = allTokens.filter((t) =>
        field.sftTokens.some((s) => s.address.toLowerCase() === t.contractAddress.toLowerCase())
      );
      const assetId = field.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const asset = catalog.getCatalog()?.assets[assetId] || null;

      if (fieldTokens.length === 0) throw new Error("No tokens found for this energy field");
      if (!asset) throw new Error("Asset data not found");

      state.update((s) => ({
        ...s,
        asset,
        tokens: fieldTokens,
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
