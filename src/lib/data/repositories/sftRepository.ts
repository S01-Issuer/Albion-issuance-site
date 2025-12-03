/**
 * SFT Repository - handles all SFT-related data fetching
 */

import { executeGraphQL } from "../clients/cachedGraphqlClient";
import {
  BASE_SFT_SUBGRAPH_URLS,
  BASE_METADATA_SUBGRAPH_URLS,
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
   * Fetch all SFTs from the subgraph
   */
  async getAllSfts(): Promise<OffchainAssetReceiptVault[]> {
    const [primaryUrl, ...fallbackUrls] = BASE_SFT_SUBGRAPH_URLS;
    const query = `
      query GetAllSfts {
        offchainAssetReceiptVaults {
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

    try {
      logDev("Fetching SFTs from:", primaryUrl);
      const data = await executeGraphQL<GetSftsResponse>(
        primaryUrl,
        query,
        undefined,
        {
          fallbackUrls,
        },
      );

      logDev("Raw SFT data received:", {
        hasData: !!data,
        hasVaults: !!data?.offchainAssetReceiptVaults,
        vaultCount: data?.offchainAssetReceiptVaults?.length || 0,
        vaultAddresses:
          data?.offchainAssetReceiptVaults?.map((v) => v.address) || [],
      });

      if (!data || !data.offchainAssetReceiptVaults) {
        console.error("[SftRepository] No data returned from subgraph");
        return [];
      }

      return data.offchainAssetReceiptVaults;
    } catch (error) {
      console.error("[SftRepository] Error fetching SFTs:", error);
      return [];
    }
  }

  /**
   * Fetch SFT metadata from the metadata subgraph
   */
  async getSftMetadata(): Promise<MetaV1S[]> {
    const [primaryUrl, ...fallbackUrls] = BASE_METADATA_SUBGRAPH_URLS;
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
        primaryUrl,
        query,
        undefined,
        {
          fallbackUrls,
        },
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
   */
  async getDepositsForOwner(
    ownerAddress: string,
  ): Promise<DepositWithReceipt[]> {
    if (!ownerAddress) return [];

    const [primaryUrl, ...fallbackUrls] = BASE_SFT_SUBGRAPH_URLS;
    const sftAddresses = ENERGY_FIELDS.flatMap((field) =>
      field.sftTokens.map((token) => token.address),
    );

    const query = `
      query GetDepositsForOwner($owner: String!, $sftIds: [String!]!) {
        depositWithReceipts(
          where: {
            and: [
              { caller_: { address: $owner } }
              { offchainAssetReceiptVault_: { id_in: $sftIds } }
            ]
          }
          orderBy: transaction__timestamp
          orderDirection: asc
        ) {
          id
          caller { address }
          amount
          offchainAssetReceiptVault { id }
          transaction { timestamp }
        }
      }
    `;

    try {
      const data = await executeGraphQL<GetDepositsResponse>(
        primaryUrl,
        query,
        {
          owner: ownerAddress.toLowerCase(),
          sftIds: sftAddresses.map((s) => s.toLowerCase()),
        },
        {
          fallbackUrls,
        },
      );
      return data.depositWithReceipts || [];
    } catch (error) {
      console.error("Error fetching deposits:", error);
      return [];
    }
  }
}

// Export singleton instance
export const sftRepository = new SftRepository();
