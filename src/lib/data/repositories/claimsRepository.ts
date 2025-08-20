/**
 * Claims Repository - handles all claims-related data fetching
 */

import { executeGraphQL } from "../clients/cachedGraphqlClient";
import { BASE_ORDERBOOK_SUBGRAPH_URL } from "$lib/network";
import type { Trade, GetTradesResponse, GetOrdersResponse } from "$lib/types/graphql";

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
    ownerAddress: string
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

    try {
      const data = await executeGraphQL<GetTradesResponse>(
        BASE_ORDERBOOK_SUBGRAPH_URL,
        query,
        {
          orderHash: cleanOrderHash,
          sender: ownerAddress.toLowerCase()
        }
      );
      return data?.trades || [];
    } catch (error) {
      console.error("Error fetching trades:", error);
      return [];
    }
  }

  /**
   * Get order details by hash
   */
  async getOrderByHash(orderHash: string): Promise<Array<{ orderBytes: string; orderHash: string; orderbook: { id: string } }>> {
    const cleanOrderHash = this.validateOrderHash(orderHash);
    if (!cleanOrderHash) return [];

    const query = `
      query GetOrderByHash($orderHash: String!) {
        orders(where: { orderHash: $orderHash }) {
          orderBytes
          orderHash
          orderbook { id }
        }
      }
    `;

    try {
      const data = await executeGraphQL<GetOrdersResponse>(
        BASE_ORDERBOOK_SUBGRAPH_URL,
        query,
        { orderHash: cleanOrderHash }
      );
      return data?.orders || [];
    } catch (error) {
      console.error("Error fetching order:", error);
      return [];
    }
  }
}

// Export singleton instance
export const claimsRepository = new ClaimsRepository();

// Export convenience functions for backwards compatibility
export const getTradesForClaims = (orderHash: string, ownerAddress: string) => 
  claimsRepository.getTradesForClaims(orderHash, ownerAddress);

export const getOrderByHash = (orderHash: string) => 
  claimsRepository.getOrderByHash(orderHash);

