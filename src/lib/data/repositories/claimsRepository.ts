/**
 * Claims Repository - handles all claims-related data fetching
 *
 * Uses the Albion REST API (via server-side proxy) instead of direct
 * subgraph queries for better performance through server-side caching.
 */

import {
  fetchOrder,
  fetchTradesBatch,
  type AlbionOrderTradeEntry,
} from "../clients/albionApi";
import type { Trade } from "$lib/types/graphql";

// Base chain: ~2s block time, genesis at Unix 1686789347
const BASE_GENESIS_TIMESTAMP = 1686789347;
const BASE_BLOCK_TIME = 2;

/**
 * Estimate a Base block number from a unix timestamp.
 * Subtracts a safety margin of 500 blocks (~17 min) to avoid missing events.
 */
function estimateBlockNumber(unixTimestamp: number): number {
  const estimated = Math.floor(
    (unixTimestamp - BASE_GENESIS_TIMESTAMP) / BASE_BLOCK_TIME,
  );
  return Math.max(0, estimated - 500);
}

/**
 * Convert an API trade entry into the Trade shape expected by sortClaimsData.
 * sortClaimsData uses: tradeEvent.transaction.{blockNumber, timestamp, id} and tradeEvent.sender
 */
function mapApiTradeToGraphqlTrade(
  apiTrade: AlbionOrderTradeEntry,
  orderHash: string,
): Trade {
  return {
    order: { orderBytes: "", orderHash },
    orderbook: { id: "" },
    tradeEvent: {
      sender: apiTrade.sender,
      transaction: {
        id: apiTrade.txHash,
        blockNumber: "", // Not available from batch endpoint; Hypersync uses orderStartBlock instead
        timestamp: apiTrade.timestamp.toString(),
      },
    },
  };
}

export class ClaimsRepository {
  /**
   * Validate order hash format
   */
  private validateOrderHash(orderHash: string): string | null {
    const cleanHash = orderHash.trim().toLowerCase();
    if (!cleanHash.startsWith("0x") || cleanHash.length !== 66) {
      console.error("Invalid orderHash format:", orderHash);
      return null;
    }
    return cleanHash;
  }

  /**
   * Get trades for a specific order and owner.
   * Uses POST /v1/trades/batch and filters by sender client-side.
   */
  async getTradesForClaims(
    orderHash: string,
    ownerAddress: string,
  ): Promise<Trade[]> {
    const cleanOrderHash = this.validateOrderHash(orderHash);
    if (!cleanOrderHash) return [];

    const batchResponse = await fetchTradesBatch([cleanOrderHash]);
    if (!batchResponse?.orders?.length) return [];

    const orderEntry = batchResponse.orders.find(
      (o) => o.orderHash.toLowerCase() === cleanOrderHash,
    );
    if (!orderEntry?.trades?.length) return [];

    const normalizedOwner = ownerAddress.toLowerCase();
    return orderEntry.trades
      .filter((t) => t.sender.toLowerCase() === normalizedOwner)
      .map((t) => mapApiTradeToGraphqlTrade(t, cleanOrderHash));
  }

  /**
   * Get order details by hash.
   * Uses GET /v1/order/{hash} and maps to the shape expected by ClaimsService.
   */
  async getOrderByHash(orderHash: string): Promise<
    Array<{
      orderBytes: string;
      orderHash: string;
      orderbook: { id: string };
      addEvents?: Array<{
        transaction: {
          id: string;
          timestamp: string;
          blockNumber: string;
        };
      }>;
    }>
  > {
    const cleanOrderHash = this.validateOrderHash(orderHash);
    if (!cleanOrderHash) return [];

    const order = await fetchOrder(cleanOrderHash);
    if (!order) return [];

    // Estimate block number from createdAt timestamp for Hypersync scan range
    const estimatedBlock = estimateBlockNumber(order.createdAt);

    return [
      {
        orderBytes: order.orderBytes,
        orderHash: order.orderHash,
        orderbook: { id: order.orderbookId },
        addEvents: [
          {
            transaction: {
              id: "",
              timestamp: order.createdAt.toString(),
              blockNumber: estimatedBlock.toString(),
            },
          },
        ],
      },
    ];
  }
}

// Export singleton instance
export const claimsRepository = new ClaimsRepository();

// Export convenience functions for backwards compatibility
export const getTradesForClaims = (orderHash: string, ownerAddress: string) =>
  claimsRepository.getTradesForClaims(orderHash, ownerAddress);

export const getOrderByHash = (orderHash: string) =>
  claimsRepository.getOrderByHash(orderHash);
