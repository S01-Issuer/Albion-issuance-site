import {
    BASE_SFT_SUBGRAPH_URL,
    ENERGY_FIELDS,
  } from "$lib/network";
  
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
      const response = await fetch(BASE_SFT_SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const result = await response.json();
  
      if (result.errors) {
        return null;
      }
  
      return result.data?.depositWithReceipts || [];
    } catch {
      return null;
    }
  };
  