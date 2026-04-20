/**
 * Albion REST API client
 * Calls through the server-side proxy at /api/albion to keep credentials private.
 */

const PROXY_BASE = "/api/albion";

// --- Response types matching the Rust API ---

export interface AlbionOrderDetail {
  orderHash: string;
  owner: string;
  orderBytes: string;
  orderbookId: string;
  createdAt: number; // unix timestamp
  trades: AlbionOrderTradeEntry[];
  // Fields we don't use but exist in the response
  orderDetails?: { type: string; ioRatio: string };
  inputToken?: { address: string; symbol: string; decimals: number };
  outputToken?: { address: string; symbol: string; decimals: number };
  ioRatio?: string;
}

export interface AlbionOrderTradeEntry {
  id: string;
  txHash: string;
  inputAmount: string;
  outputAmount: string;
  timestamp: number;
  sender: string;
}

export interface AlbionTradesBatchResponse {
  orders: AlbionTradesBatchEntry[];
}

export interface AlbionTradesBatchEntry {
  orderHash: string;
  trades: AlbionOrderTradeEntry[];
}

/**
 * Fetch order details by hash
 */
export async function fetchOrder(
  orderHash: string,
): Promise<AlbionOrderDetail | null> {
  try {
    const res = await fetch(`${PROXY_BASE}/v1/order/${orderHash}`);
    if (!res.ok) {
      console.error(`[AlbionAPI] fetchOrder ${orderHash} failed: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("[AlbionAPI] fetchOrder error:", err);
    return null;
  }
}

/**
 * Fetch trades for multiple orders in a single request
 */
export async function fetchTradesBatch(
  orderHashes: string[],
): Promise<AlbionTradesBatchResponse | null> {
  try {
    const res = await fetch(`${PROXY_BASE}/v1/trades/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderHashes }),
    });
    if (!res.ok) {
      console.error(`[AlbionAPI] fetchTradesBatch failed: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("[AlbionAPI] fetchTradesBatch error:", err);
    return null;
  }
}
