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
import type {
  GetSftsResponse,
  GetMetadataResponse,
  GetDepositsResponse,
  OffchainAssetReceiptVault,
  MetaV1S,
  DepositWithReceipt,
} from "$lib/types/graphql";

// Log which token addresses we are operating on (derived from ENERGY_FIELDS)
console.log("[SftRepository] METABOARD_ADMIN is set to:", ACTIVE_METABOARD_ADMIN);
console.log(
  "[SftRepository] Active ENERGY_FIELDS tokens:",
  ENERGY_FIELDS.flatMap((f) => f.sftTokens.map((t) => t.address)),
);
console.log("[SftRepository] Energy fields:", ENERGY_FIELDS.map(f => ({
  name: f.name,
  tokens: f.sftTokens.map(t => t.address)
})));

export class SftRepository {
  /**
   * Fetch all SFTs from the subgraph
   */
  async getAllSfts(): Promise<OffchainAssetReceiptVault[]> {
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
      console.log("[SftRepository] Fetching SFTs from:", BASE_SFT_SUBGRAPH_URL);
      const data = await executeGraphQL<GetSftsResponse>(
        BASE_SFT_SUBGRAPH_URL,
        query,
      );

      console.log("[SftRepository] Raw SFT data received:", {
        hasData: !!data,
        hasVaults: !!data?.offchainAssetReceiptVaults,
        vaultCount: data?.offchainAssetReceiptVaults?.length || 0,
        vaultAddresses: data?.offchainAssetReceiptVaults?.map(v => v.address) || []
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
   */
  async getDepositsForOwner(
    ownerAddress: string,
  ): Promise<DepositWithReceipt[]> {
    if (!ownerAddress) return [];

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
        ) {
          id
          caller { address }
          amount
          offchainAssetReceiptVault { id }
        }
      }
    `;

    try {
      const data = await executeGraphQL<GetDepositsResponse>(
        BASE_SFT_SUBGRAPH_URL,
        query,
        {
          owner: ownerAddress.toLowerCase(),
          sftIds: sftAddresses.map((s) => s.toLowerCase()),
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
