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
import { hasAvailableSupplySync } from "$lib/utils/supplyHelpers";

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
  // State management - start with loading true only if we have an ID
  const state: Writable<AssetDetailState> = writable({
    asset: null,
    tokens: [],
    loading: !!initialEnergyFieldId, // Only show loading if we have an ID to load
    error: null,
  });

  // Track what we've loaded to prevent duplicate loads
  let currentlyLoadingId: string | null = null;
  let loadedId: string | null = null;

  // Load asset and related data for an energy field
  async function loadAssetData(energyFieldId?: string) {
    const id = energyFieldId || initialEnergyFieldId;

    // Prevent duplicate loads
    if (currentlyLoadingId === id || loadedId === id) {
      return;
    }

    currentlyLoadingId = id;
    state.update((s) => ({ ...s, loading: true, error: null }));

    try {
      console.log("[useAssetDetailData] Loading data for ID:", id);
      console.log(
        "[useAssetDetailData] Available energy fields:",
        ENERGY_FIELDS.map((f) => ({
          name: f.name,
          slug: f.name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, ""),
          tokens: f.sftTokens.map((t) => t.address),
        })),
      );

      const catalog = useCatalogService();
      await catalog.build();

      // Find field by ID and collect tokens from catalog
      // Try to match by slugified field name first
      let field = ENERGY_FIELDS.find(
        (f) =>
          f.name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "") === id,
      );

      // If not found, try to match by contract address prefix (fallback from getEnergyFieldId)
      if (!field && id.length === 8) {
        console.log(
          "[useAssetDetailData] Trying to match by contract address prefix:",
          id,
        );
        field = ENERGY_FIELDS.find((f) =>
          f.sftTokens.some(
            (token) =>
              token.address.toLowerCase().replace(/^0x/, "").substring(0, 8) ===
              id,
          ),
        );
      }

      console.log("[useAssetDetailData] Found field:", field);

      if (!field) throw new Error("Energy field not found");

      const catalogData = catalog.getCatalog();
      console.log("[useAssetDetailData] Catalog data:", {
        hasAssets: !!catalogData?.assets,
        assetKeys: Object.keys(catalogData?.assets || {}),
        hasTokens: !!catalogData?.tokens,
        tokenCount: Object.keys(catalogData?.tokens || {}).length,
      });

      if (!catalogData) throw new Error("Failed to build catalog");

      const allTokens = Object.values(catalogData.tokens || {});
      const fieldTokens: TokenMetadata[] = allTokens.filter((t) =>
        field.sftTokens.some(
          (s) => s.address.toLowerCase() === t.contractAddress.toLowerCase(),
        ),
      );
      const assetId = field.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      const asset = catalogData.assets[assetId] || null;

      console.log("[useAssetDetailData] Result:", {
        assetId,
        foundAsset: !!asset,
        fieldTokensCount: fieldTokens.length,
        fieldTokenAddresses: fieldTokens.map((t) => t.contractAddress),
      });

      if (fieldTokens.length === 0)
        throw new Error("No tokens found for this energy field");
      if (!asset) throw new Error("Asset data not found");

      state.update((s) => ({
        ...s,
        asset,
        tokens: fieldTokens,
        loading: false,
      }));
      loadedId = id;
      currentlyLoadingId = null;
    } catch (err) {
      console.error("[useAssetDetailData] Error:", err);
      state.update((s) => ({
        ...s,
        error:
          err instanceof Error
            ? err.message
            : "Failed to load energy field data",
        loading: false,
      }));
      currentlyLoadingId = null;
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
      // Use supply helper to check availability
      return hasAvailableSupplySync(token);
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
