import { BASE_SFT_SUBGRAPH_URL } from "$lib/network";
import { executeGraphQL } from "$lib/data/clients/graphqlClient";

export const getSfts = async (): Promise<any> => {
  // Trimmed query to only what's used across the app currently
  const query = `
    { offchainAssetReceiptVaults {
        id
        totalShares
        address
        name
        symbol
        deployTimestamp
        activeAuthorizer { address }
        tokenHolders { address balance }
    } }
  `;

  const data = await executeGraphQL<{ offchainAssetReceiptVaults: any[] }>(
    BASE_SFT_SUBGRAPH_URL,
    query
  );

  return data.offchainAssetReceiptVaults;
};
