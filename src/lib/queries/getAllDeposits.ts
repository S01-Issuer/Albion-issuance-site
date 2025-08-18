import {
    BASE_SFT_SUBGRAPH_URL,
    ENERGY_FIELDS,
  } from "$lib/network";
import { executeGraphQL } from "$lib/data/clients/graphqlClient";
  
  export const getAllDeposits = async (
    ownerAddress: string,
  ): Promise<any> => {
    const sftAddresses = ENERGY_FIELDS.flatMap((field) =>
        field.sftTokens.map((token) => token.address),
    );
  
    const query = `
     {
    depositWithReceipts(where: {
      and: [
        {caller_: {address: "${ownerAddress.toLowerCase()}"}}
        {offchainAssetReceiptVault_:{id_in: [${sftAddresses.map((s) => `"${s.toString().toLowerCase()}"`).join(",")}]}}
      ]
    }) {
      id
      caller {
        address
      }
      amount
      offchainAssetReceiptVault{
        id
      }
      
    }
}
  
      `;
  
    try {
      const data = await executeGraphQL<{ depositWithReceipts: any[] }>(
        BASE_SFT_SUBGRAPH_URL,
        query
      );
      return data.depositWithReceipts || [];
    } catch {
      return null;
    }
  };
  