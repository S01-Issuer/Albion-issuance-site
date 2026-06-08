/**
 * Claims Repository - handles all claims-related data fetching
 */

import { executeGraphQL } from "../clients/cachedGraphqlClient";
import { ORDERBOOK_SOURCES } from "$lib/network";
import type {
  Trade,
  GetTradesResponse,
  GetOrdersResponse,
} from "$lib/types/graphql";

/**
 * Run a GraphQL query against EVERY OrderBook era's subgraph (v4 + v6) and flatten
 * the results. Each era is a distinct dataset, so we query them all and merge; a
 * failing era resolves to an empty list rather than aborting the others.
 */
async function queryAllOrderbookSubgraphs<T>(
  query: string,
  variables: Record<string, unknown>,
  pick: (data: T | null) => unknown[],
): Promise<unknown[]> {
  const results = await Promise.allSettled(
    ORDERBOOK_SOURCES.map(async ({ address, subgraphUrls }) => {
      const [primaryUrl, ...fallbackUrls] = subgraphUrls;
      if (!primaryUrl) return { address, items: [] as unknown[] };
      const data = await executeGraphQL<T>(primaryUrl, query, variables, {
        fallbackUrls,
      });
      return { address, items: pick(data) };
    }),
  );
  const merged: unknown[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { address, items } = r.value;
    // Each era's subgraph indexes a single OrderBook, so tag every result with its
    // source address. This lets the shared query omit an `orderbook { id }` field —
    // the v6 raindex subgraph is single-OB and doesn't expose one — while callers
    // (ClaimsService) still resolve each order's era from `orderbook.id`.
    for (const it of items) {
      merged.push(
        it && typeof it === "object" && !("orderbook" in it)
          ? { ...(it as Record<string, unknown>), orderbook: { id: address } }
          : it,
      );
    }
  }
  return merged;
}

export type OrderDetail = {
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
};

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
   * Get trades for a specific order and owner
   */
  async getTradesForClaims(
    orderHash: string,
    ownerAddress: string,
  ): Promise<Trade[]> {
    const cleanOrderHash = this.validateOrderHash(orderHash);
    if (!cleanOrderHash) return [];

    const query = `
      query GetTradesForClaims($orderHash: String!, $sender: String!) {
        trades(
          where: {
            and: [
              { order_: { orderHash: $orderHash } },
              { tradeEvent_: { sender: $sender } }
            ]
          }
        ) {
          order { orderBytes orderHash }
          orderbook { id }
          tradeEvent {
            transaction { id blockNumber timestamp }
            sender
          }
        }
      }
    `;

    const trades = await queryAllOrderbookSubgraphs<GetTradesResponse>(
      query,
      { orderHash: cleanOrderHash, sender: ownerAddress.toLowerCase() },
      (data) => data?.trades || [],
    );
    return trades as Trade[];
  }

  /**
   * Get order details by hash
   */
  async getOrderByHash(orderHash: string): Promise<OrderDetail[]> {
    const cleanOrderHash = this.validateOrderHash(orderHash);
    if (!cleanOrderHash) return [];

    const query = `
      query GetOrderByHash($orderHash: String!) {
        orders(where: { orderHash: $orderHash }) {
          orderBytes
          orderHash
          addEvents {
            transaction {
              id
              timestamp
              blockNumber
            }
          }
        }
      }
    `;

    const orders = await queryAllOrderbookSubgraphs<GetOrdersResponse>(
      query,
      { orderHash: cleanOrderHash },
      (data) => data?.orders || [],
    );
    return orders as OrderDetail[];
  }

  /**
   * Batch fetch order details for multiple hashes in a single query
   */
  async getOrdersByHashes(orderHashes: string[]): Promise<OrderDetail[]> {
    const cleanHashes = orderHashes
      .map((h) => this.validateOrderHash(h))
      .filter((h): h is string => h !== null);

    if (cleanHashes.length === 0) return [];

    const query = `
      query GetOrdersByHashes($orderHashes: [String!]!) {
        orders(where: { orderHash_in: $orderHashes }) {
          orderBytes
          orderHash
          addEvents {
            transaction {
              id
              timestamp
              blockNumber
            }
          }
        }
      }
    `;

    const orders = await queryAllOrderbookSubgraphs<GetOrdersResponse>(
      query,
      { orderHashes: cleanHashes },
      (data) => data?.orders || [],
    );
    return orders as OrderDetail[];
  }
}

// Export singleton instance
export const claimsRepository = new ClaimsRepository();

// Export convenience functions for backwards compatibility
export const getTradesForClaims = (orderHash: string, ownerAddress: string) =>
  claimsRepository.getTradesForClaims(orderHash, ownerAddress);

export const getOrderByHash = (orderHash: string) =>
  claimsRepository.getOrderByHash(orderHash);
