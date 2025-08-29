/**
 * @fileoverview Type transformation layer for tokens
 *
 * This module provides transformation from TokenMetadata to UI Token types.
 * Asset transformations have been moved to src/lib/decodeMetadata/addSchemaToReceipts.ts
 */

import type { TokenMetadata } from "./MetaboardTypes";
import type { Token as UIToken } from './uiTypes';

export class TypeTransformations {
  /**
   * Transform TokenMetadata directly to UI Token
   * Converts token data for UI display
   */
  static tokenToUI(tokenData: TokenMetadata): UIToken {
    return {
      contractAddress: tokenData.contractAddress,
      name: tokenData.releaseName || tokenData.asset.assetName, // Use releaseName or fall back to asset.assetName
      symbol: tokenData.symbol,
      decimals: tokenData.decimals,
      tokenType: "royalty", // Default type, can be enhanced later
      isActive: true,
      supply: {
        maxSupply: tokenData.supply.maxSupply,
        mintedSupply: tokenData.supply.mintedSupply,
      },
      // Add converted supply values for calculations
      supplyNumbers: {
        maxSupply: Number(
          BigInt(tokenData.supply.maxSupply) / BigInt(10 ** tokenData.decimals),
        ),
        mintedSupply: Number(
          BigInt(tokenData.supply.mintedSupply) /
            BigInt(10 ** tokenData.decimals),
        ),
      },
      holders: [], // Will be populated by service layer
      payoutHistory:
        tokenData.payoutData?.map((payout) => {
          // Find corresponding receipts data for oil/gas prices and production volume
          const receipts = tokenData.asset.receiptsData?.find(
            (r) => r.month === payout.month,
          );
          return {
            month: payout.month,
            date: payout.tokenPayout.date.split("T")[0] as any, // Convert to YYYY-MM-DD format
            totalPayout: payout.tokenPayout.totalPayout,
            payoutPerToken: payout.tokenPayout.payoutPerToken,
            oilPrice: receipts?.realisedPrice.oilPrice || 0,
            gasPrice: receipts?.realisedPrice.gasPrice || 0,
            productionVolume: receipts?.assetData.production || 0,
            txHash: payout.tokenPayout.txHash,
          };
        }) || [],
      sharePercentage: tokenData.sharePercentage,
      firstPaymentDate: tokenData.firstPaymentDate,
      metadata: {
        description: `Token representing ${tokenData.sharePercentage}% ownership in ${tokenData.asset.assetName}`,
        image: "", // Will be set by service layer
        external_url: "", // Will be set by service layer
        attributes: [],
      },
    };
  }
}