/**
 * @fileoverview Platform statistics composable
 * Manages platform-wide statistics and calculations
 */

import { derived } from "svelte/store";
import { sfts, sftMetadata } from "$lib/stores";
import { formatEther } from "viem";
import { formatSmartNumber } from "$lib/utils/formatters";
import { decodeSftInformation } from "$lib/decodeMetadata/helpers";
import { ENERGY_FIELDS } from "$lib/network";
import type { PinnedMetadata } from "$lib/types/PinnedMetadata";

/**
 * Composable for platform statistics that uses sfts data
 */
export function usePlatformStats() {
  // Return a derived store that calculates platform stats from sfts and metadata
  const platformStats = derived(
    [sfts, sftMetadata],
    ([$sfts, $sftMetadata]) => {
      if (!$sfts || $sfts.length === 0 || !$sftMetadata) {
        return {
          loading: true,
          totalAssets: 0,
          totalInvested: 0,
          activeInvestors: 0,
          totalRegions: 0,
          monthlyGrowthRate: 0,
          error: null,
        };
      }

      try {
        // Get list of valid token addresses from ENERGY_FIELDS
        const validTokenAddresses = new Set<string>();
        for (const field of ENERGY_FIELDS) {
          for (const tokenInfo of field.sftTokens) {
            validTokenAddresses.add(tokenInfo.address.toLowerCase());
          }
        }

        // Collect unique addresses across ENERGY_FIELDS contracts only
        const uniqueHolders = new Set<string>();

        $sfts.forEach((sft) => {
          // Only process SFTs that are in ENERGY_FIELDS
          if (!validTokenAddresses.has(sft.id.toLowerCase())) {
            return; // Skip this SFT
          }

          if (sft.tokenHolders && Array.isArray(sft.tokenHolders)) {
            sft.tokenHolders.forEach((holder) => {
              if (
                holder.address &&
                holder.balance &&
                Number(holder.balance) > 0
              ) {
                const holderAddr = holder.address.toLowerCase();
                // Add to unique holders set
                uniqueHolders.add(holderAddr);

                // Track which contracts this holder has tokens in
              }
            });
          }
        });

        const totalTokenHolders = uniqueHolders.size;

        // Use ENERGY_FIELDS as canonical source for asset counting
        const totalAssets = ENERGY_FIELDS.length;

        // Decode metadata to get country information
        const decodedMeta = $sftMetadata
          .map((metaV1) => decodeSftInformation(metaV1))
          .filter((meta): meta is PinnedMetadata => Boolean(meta));
        const countries = new Set<string>();

        // Only process tokens that are in ENERGY_FIELDS
        for (const field of ENERGY_FIELDS) {
          for (const tokenInfo of field.sftTokens) {
            const tokenAddress = tokenInfo.address.toLowerCase();
            const sft = $sfts.find((s) => s.id.toLowerCase() === tokenAddress);
            if (sft) {
              const pinnedMetadata = decodedMeta.find(
                (meta) =>
                  meta.contractAddress?.toLowerCase() ===
                  `0x000000000000000000000000${sft.id.slice(2).toLowerCase()}`,
              );
              if (pinnedMetadata?.asset) {
                // Add country to set
                const country = pinnedMetadata.asset.location?.country;
                if (country && country.trim() !== "") {
                  countries.add(country);
                }
              }
            }
          }
        }

        const totalRegions = countries.size;

        // Calculate total invested by summing totalShares from ENERGY_FIELDS tokens only
        // Since each token costs $1 USDT, total invested = total minted tokens
        let totalInvested = 0;

        // Only count tokens that are in ENERGY_FIELDS (active assets)
        for (const field of ENERGY_FIELDS) {
          for (const tokenInfo of field.sftTokens) {
            const tokenAddress = tokenInfo.address.toLowerCase();
            const sft = $sfts.find((s) => s.id.toLowerCase() === tokenAddress);
            if (sft && sft.totalShares && sft.totalShares !== "0") {
              // totalShares is in wei format (18 decimals), convert to USD
              const shares = Number(formatEther(BigInt(sft.totalShares)));
              totalInvested += shares;
            }
          }
        }
        const stats = {
          loading: false,
          totalAssets: totalAssets,
          totalInvested: totalInvested, // Already converted to number
          activeInvestors: totalTokenHolders,
          totalRegions: totalRegions,
          monthlyGrowthRate: 2, // Don't know what this is yet
          error: null,
        };
        return stats;
      } catch (error) {
        return {
          loading: false,
          totalAssets: 0,
          totalInvested: 0,
          activeInvestors: 0,
          totalRegions: 0,
          monthlyGrowthRate: 0,
          error:
            error instanceof Error
              ? error.message
              : "Failed to calculate stats",
        };
      }
    },
  );

  // Formatted values for display
  const formattedStats = derived(platformStats, ($stats) => ({
    totalInvested: formatSmartNumber($stats.totalInvested, {
      prefix: "$",
      threshold: 1000000,
      forceCompact: true,
    }),
    totalAssets: ($stats.totalAssets || 0).toString(),
    activeInvestors: formatSmartNumber($stats.activeInvestors || 0, {
      threshold: 1000,
    }),
    regionsText: `Across ${$stats.totalRegions} ${$stats.totalRegions === 1 ? "country" : "countries"}`,
    growthTrend: {
      value: $stats.monthlyGrowthRate,
      positive: $stats.monthlyGrowthRate >= 0,
    },
  }));

  return {
    platformStats,
    formattedStats,
  };
}
