import {
  BASE_ORDERBOOK_SUBGRAPH_URL,
  BASE_SFT_SUBGRAPH_URL,
  ENERGY_FIELDS,
} from "$lib/network";

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
    const response = await fetch(BASE_ORDERBOOK_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      return null;
    }

    return result.data?.trades || [];
  } catch (error) {
    console.error("Error fetching trades:", error);
    return null;
  }
};
