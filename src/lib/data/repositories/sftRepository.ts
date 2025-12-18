/**
 * SFT Repository - handles all SFT-related data fetching
 */

import { executeGraphQL } from "../clients/cachedGraphqlClient";
import {
  BASE_SFT_SUBGRAPH_URL,
  BASE_METADATA_SUBGRAPH_URL,
  ENERGY_FIELDS,
  ACTIVE_METABOARD_ADMIN,
} from "$lib/network";

const isDev = import.meta.env?.DEV ?? false;

const logDev = (...messages: unknown[]) => {
  if (isDev) {
    console.warn("[SftRepository]", ...messages);
  }
};
import type {
  GetSftsResponse,
  GetMetadataResponse,
  GetDepositsResponse,
  OffchainAssetReceiptVault,
  MetaV1S,
  DepositWithReceipt,
} from "$lib/types/graphql";

// Log which token addresses we are operating on (derived from ENERGY_FIELDS)
logDev("METABOARD_ADMIN is set to:", ACTIVE_METABOARD_ADMIN);
logDev(
  "Active ENERGY_FIELDS tokens:",
  ENERGY_FIELDS.flatMap((f) => f.sftTokens.map((t) => t.address)),
);
logDev(
  "Energy fields:",
  ENERGY_FIELDS.map((f) => ({
    name: f.name,
    tokens: f.sftTokens.map((t) => t.address),
  })),
);

export class SftRepository {
  /**
   * Fetch all token holders for a specific SFT with pagination
   */
  private async getTokenHoldersForSft(
    sftId: string,
  ): Promise<Array<{ address: string; balance: string }>> {
    const query = `
      query GetTokenHolders($sftId: String!, $first: Int!, $skip: Int!) {
        offchainAssetReceiptVault(id: $sftId) {
          id
          tokenHolders(
            first: $first
            skip: $skip
            orderBy: balance
            orderDirection: desc
          ) {
            address
            balance
          }
        }
      }
    `;

    const allTokenHolders: Array<{ address: string; balance: string }> = [];
    const pageSize = 1000;
    let skip = 0;
    let hasMore = true;

    try {
      while (hasMore) {
        const data = await executeGraphQL<{
          offchainAssetReceiptVault?: {
            id: string;
            tokenHolders: Array<{ address: string; balance: string }>;
          };
        }>(BASE_SFT_SUBGRAPH_URL, query, {
          sftId: sftId.toLowerCase(),
          first: pageSize,
          skip,
        });

        const tokenHolders =
          data?.offchainAssetReceiptVault?.tokenHolders || [];

        if (tokenHolders.length === 0) {
          hasMore = false;
        } else {
          allTokenHolders.push(...tokenHolders);

          // If we got fewer results than the page size, we've reached the end
          if (tokenHolders.length < pageSize) {
            hasMore = false;
          } else {
            skip += pageSize;
          }
        }
      }

      return allTokenHolders;
    } catch (error) {
      console.error(
        `[SftRepository] Error fetching token holders for SFT ${sftId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Fetch all SFTs from the subgraph
   * Only fetches SFTs that are in ENERGY_FIELDS
   * Implements pagination to fetch all SFTs and all token holders
   */
  async getAllSfts(): Promise<OffchainAssetReceiptVault[]> {
    const sftAddresses = ENERGY_FIELDS.flatMap((field) =>
      field.sftTokens.map((token) => token.address),
    );

    if (sftAddresses.length === 0) {
      logDev("No SFT addresses found in ENERGY_FIELDS");
      return [];
    }

    const query = `
      query GetAllSfts($sftIds: [String!]!, $first: Int!, $skip: Int!) {
        offchainAssetReceiptVaults(
          where: { id_in: $sftIds }
          first: $first
          skip: $skip
        ) {
          id
          totalShares
          address
          name
          symbol
          deployTimestamp
          activeAuthorizer { address }
          tokenHolders { address balance }
        }
      }
    `;

    const allSfts: OffchainAssetReceiptVault[] = [];
    const pageSize = 1000;
    let skip = 0;
    let hasMore = true;

    try {
      logDev("Fetching SFTs from:", BASE_SFT_SUBGRAPH_URL, {
        sftAddressesCount: sftAddresses.length,
        sftAddresses: sftAddresses,
      });

      while (hasMore) {
        const data = await executeGraphQL<GetSftsResponse>(
          BASE_SFT_SUBGRAPH_URL,
          query,
          {
            sftIds: sftAddresses.map((s) => s.toLowerCase()),
            first: pageSize,
            skip,
          },
        );

        const sfts = data?.offchainAssetReceiptVaults || [];

        if (sfts.length === 0) {
          hasMore = false;
        } else {
          allSfts.push(...sfts);

          // If we got fewer results than the page size, we've reached the end
          if (sfts.length < pageSize) {
            hasMore = false;
          } else {
            skip += pageSize;
          }
        }
      }

      logDev("Raw SFT data received:", {
        hasData: allSfts.length > 0,
        vaultCount: allSfts.length,
        vaultAddresses: allSfts.map((v) => v.address),
      });

      // Fetch all token holders for each SFT with pagination
      logDev("Fetching token holders for all SFTs...");
      const sftsWithTokenHolders = await Promise.all(
        allSfts.map(async (sft) => {
          const tokenHolders = await this.getTokenHoldersForSft(sft.id);
          logDev(`Fetched ${tokenHolders.length} token holders for SFT ${sft.id}`);
          return {
            ...sft,
            tokenHolders,
          };
        }),
      );

      logDev("All SFTs with token holders fetched:", {
        totalSfts: sftsWithTokenHolders.length,
        totalTokenHolders: sftsWithTokenHolders.reduce(
          (sum, sft) => sum + sft.tokenHolders.length,
          0,
        ),
      });

      return sftsWithTokenHolders;
    } catch (error) {
      console.error("[SftRepository] Error fetching SFTs:", error);
      return [];
    }
  }

  /**
   * Fetch SFT metadata from the metadata subgraph
   */
  async getSftMetadata(): Promise<MetaV1S[]> {
    // Extract all SFT addresses from ENERGY_FIELDS
    const sftAddresses = ENERGY_FIELDS.flatMap((field) =>
      field.sftTokens.map((token) => token.address),
    );

    // Create the subjects array for the GraphQL query
    const subjects = sftAddresses.map(
      (address) => `"0x000000000000000000000000${address.slice(2)}"`,
    );

    const query = `
      query GetSftMetadata {
        metaV1S(
          where: {
            subject_in: [${subjects.join(",")}],
            sender: "${ACTIVE_METABOARD_ADMIN.toLowerCase()}"
          },
          orderBy: transaction__timestamp
          orderDirection: desc
          first: ${subjects.length}
        ) {
          id
          meta
          sender
          subject
          metaHash
        }
      }
    `;

    try {
      const data = await executeGraphQL<GetMetadataResponse>(
        BASE_METADATA_SUBGRAPH_URL,
        query,
      );

      if (!data || !data.metaV1S) {
        console.error("[SftRepository] No metadata returned from subgraph");
        return [];
      }

      return data.metaV1S;
    } catch (error) {
      console.error("Error fetching SFT metadata:", error);
      return [];
    }
  }

  /**
   * Fetch deposits for a specific owner address
   * Implements pagination to fetch all deposits
   */
  async getDepositsForOwner(
    ownerAddress: string,
  ): Promise<DepositWithReceipt[]> {
    if (!ownerAddress) return [];

    const sftAddresses = ENERGY_FIELDS.flatMap((field) =>
      field.sftTokens.map((token) => token.address),
    );

    const query = `
      query GetDepositsForOwner($owner: String!, $sftIds: [String!]!, $first: Int!, $skip: Int!) {
        depositWithReceipts(
          where: {
            and: [
              { caller_: { address: $owner } }
              { offchainAssetReceiptVault_: { id_in: $sftIds } }
            ]
          }
          first: $first
          skip: $skip
        ) {
          id
          caller { address }
          amount
          offchainAssetReceiptVault { id }
        }
      }
    `;

    const allDeposits: DepositWithReceipt[] = [];
    const pageSize = 1000;
    let skip = 0;
    let hasMore = true;

    try {
      while (hasMore) {
        const data = await executeGraphQL<GetDepositsResponse>(
          BASE_SFT_SUBGRAPH_URL,
          query,
          {
            owner: ownerAddress.toLowerCase(),
            sftIds: sftAddresses.map((s) => s.toLowerCase()),
            first: pageSize,
            skip,
          },
        );

        const deposits = data.depositWithReceipts || [];
        
        if (deposits.length === 0) {
          hasMore = false;
        } else {
          allDeposits.push(...deposits);
          
          // If we got fewer results than the page size, we've reached the end
          if (deposits.length < pageSize) {
            hasMore = false;
          } else {
            skip += pageSize;
          }
        }
      }

      logDev(
        `Fetched ${allDeposits.length} deposits for owner ${ownerAddress}`,
      );
      return allDeposits;
    } catch (error) {
      console.error("Error fetching deposits:", error);
      return [];
    }
  }
}

// Export singleton instance
export const sftRepository = new SftRepository();
