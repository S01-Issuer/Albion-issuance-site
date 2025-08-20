/**
 * SFT Repository - handles all SFT-related data fetching
 */

import { executeGraphQL } from "../clients/cachedGraphqlClient";
import { BASE_SFT_SUBGRAPH_URL, BASE_METADATA_SUBGRAPH_URL, ENERGY_FIELDS } from "$lib/network";
import type {
  GetSftsResponse,
  GetMetadataResponse,
  GetDepositsResponse,
  OffchainAssetReceiptVault,
  MetaV1S,
  DepositWithReceipt
} from "$lib/types/graphql";

// Use environment variable if available, otherwise use default
const METABOARD_ADMIN = (typeof process !== 'undefined' && process.env?.PUBLIC_METABOARD_ADMIN) || 
                        (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_METABOARD_ADMIN) ||
                        "0x0000000000000000000000000000000000000000";

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

    const data = await executeGraphQL<GetSftsResponse>(
      BASE_SFT_SUBGRAPH_URL,
      query
    );

    return data.offchainAssetReceiptVaults || [];
  }

  /**
   * Fetch SFT metadata from the metadata subgraph
   */
  async getSftMetadata(): Promise<MetaV1S[]> {
    // Extract all SFT addresses from ENERGY_FIELDS
    const sftAddresses = ENERGY_FIELDS.flatMap((field) =>
      field.sftTokens.map((token) => token.address)
    );

    // Create the subjects array for the GraphQL query
    const subjects = sftAddresses.map(
      (address) => `"0x000000000000000000000000${address.slice(2)}"`
    );

    const query = `
      query GetSftMetadata {
        metaV1S(
          where: {
            subject_in: [${subjects.join(",")}],
            sender: "${METABOARD_ADMIN.toLowerCase()}"
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
        query
      );
      return data.metaV1S || [];
    } catch (error) {
      console.error("Error fetching SFT metadata:", error);
      return [];
    }
  }

  /**
   * Fetch deposits for a specific owner address
   */
  async getDepositsForOwner(ownerAddress: string): Promise<DepositWithReceipt[]> {
    if (!ownerAddress) return [];

    const sftAddresses = ENERGY_FIELDS.flatMap((field) =>
      field.sftTokens.map((token) => token.address)
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
          sftIds: sftAddresses.map(s => s.toLowerCase())
        }
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