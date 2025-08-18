import {
  BASE_ORDERBOOK_SUBGRAPH_URL,
  BASE_SFT_SUBGRAPH_URL,
  ENERGY_FIELDS,
} from "$lib/network";
import { executeGraphQL } from "$lib/data/clients/graphqlClient";

export const getTradesForClaims = async (
  orderHash: string,
  ownerAddress: string,
  feildName: string,
): Promise<any> => {
  // Clean and validate the orderHash
  const cleanOrderHash = orderHash.trim().toLowerCase();
  if (!cleanOrderHash.startsWith("0x") || cleanOrderHash.length !== 66) {
    console.error("Invalid orderHash format:", orderHash);
    return null;
  }

  const query = `
   {
  trades(
    where: {
      and: [
        { order_: { orderHash: "${cleanOrderHash}" } },
        { tradeEvent_: { sender: "${ownerAddress.toLowerCase()}" } }
      ]
    }
  ) {
    order {
      orderBytes
      orderHash
    }
    orderbook{
      id
    }
    tradeEvent {
      transaction {
        id
        blockNumber
        timestamp
      }
      sender
    }
  }
}

    `;

  try {
    const data = await executeGraphQL<{ trades: any[] }>(
      BASE_ORDERBOOK_SUBGRAPH_URL,
      query
    );
    return data.trades || [];
  } catch (error) {
    console.error("Error fetching trades:", error);
    return null;
  }
};
