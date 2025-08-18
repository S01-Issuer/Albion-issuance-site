import { BASE_ORDERBOOK_SUBGRAPH_URL } from "$lib/network";
import { executeGraphQL } from "$lib/data/clients/graphqlClient";

export const getOrder = async (orderHash: string): Promise<any> => {
  // Clean and validate the orderHash
  const cleanOrderHash = orderHash.trim().toLowerCase();
  if (!cleanOrderHash.startsWith("0x") || cleanOrderHash.length !== 66) {
    console.error("Invalid orderHash format:", orderHash);
    return null;
  }

  const query = `
   {
  orders(
    where: {
        orderHash: "${cleanOrderHash}"
    }
  ) {
      orderBytes
      orderHash
      orderbook{
      id
    }
  }
}

    `;

  try {
    const data = await executeGraphQL<{ orders: any[] }>(
      BASE_ORDERBOOK_SUBGRAPH_URL,
      query
    );
    return data.orders || [];
  } catch {
    return null;
  }
};
