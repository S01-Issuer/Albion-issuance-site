import { executeGraphQL } from "$lib/data/clients/graphqlClient";
import { BASE_ORDERBOOK_SUBGRAPH_URL } from "$lib/network";

export async function getTradesForClaims(
  orderHash: string,
  ownerAddress: string
): Promise<any[] | null> {
  const cleanOrderHash = orderHash.trim().toLowerCase();
  if (!cleanOrderHash.startsWith("0x") || cleanOrderHash.length !== 66) {
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
    order { orderBytes orderHash }
    orderbook{ id }
    tradeEvent {
      transaction { id blockNumber timestamp }
      sender
    }
  }
}`;

  try {
    const data = await executeGraphQL<{ trades: any[] }>(
      BASE_ORDERBOOK_SUBGRAPH_URL,
      query
    );
    return data.trades || [];
  } catch {
    return null;
  }
}

export async function getOrderByHash(orderHash: string): Promise<any[] | null> {
  const cleanOrderHash = orderHash.trim().toLowerCase();
  if (!cleanOrderHash.startsWith("0x") || cleanOrderHash.length !== 66) {
    return null;
  }

  const query = `
   {
  orders(where: { orderHash: "${cleanOrderHash}" }) {
    orderBytes
    orderHash
    orderbook{ id }
  }
}`;

  try {
    const data = await executeGraphQL<{ orders: any[] }>(
      BASE_ORDERBOOK_SUBGRAPH_URL,
      query
    );
    return data.orders || [];
  } catch {
    return null;
  }
}

