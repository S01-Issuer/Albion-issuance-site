import { BASE_ORDERBOOK_SUBGRAPH_URL } from "$lib/network";

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
      return null;
    }

    return result.data?.orders || [];
  } catch {
    return null;
  }
};
