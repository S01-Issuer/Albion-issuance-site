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
    ORDERBOOK_SOURCES.map(({ subgraphUrls }) => {
      const [primaryUrl, ...fallbackUrls] = subgraphUrls;
      if (!primaryUrl) return Promise.resolve(null);
      return executeGraphQL<T>(primaryUrl, query, variables, { fallbackUrls });
    }),
  );
  const merged: unknown[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") merged.push(...pick(r.value as T | null));
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
          orderbook { id }
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
          orderbook { id }
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
