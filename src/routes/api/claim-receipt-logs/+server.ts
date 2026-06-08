import { json, type RequestHandler } from "@sveltejs/kit";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { transactionHashes, orderbookAddress } = (await request.json()) as {
      transactionHashes?: string[];
      orderbookAddress?: string;
    };

    if (!transactionHashes?.length || !orderbookAddress) {
      return json({ logs: [] });
    }

    const client = createPublicClient({
      chain: base,
      transport: http(),
    });

    const normalizedOrderbook = orderbookAddress.toLowerCase();
    const logs: Array<{
      block_number: string;
      transaction_hash: string;
      data: string;
      timestamp: number | null;
    }> = [];

    for (const hash of transactionHashes) {
      const receipt = await client.getTransactionReceipt({
        hash: hash as `0x${string}`,
      });
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      const blockTimestamp =
        typeof block.timestamp === "bigint"
          ? Number(block.timestamp)
          : Number(block.timestamp);

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== normalizedOrderbook) continue;

        logs.push({
          block_number: receipt.blockNumber.toString(),
          transaction_hash: hash.toLowerCase(),
          data: log.data,
          timestamp: blockTimestamp,
        });
      }
    }

    return json({ logs });
  } catch (err) {
    console.error("[api/claim-receipt-logs]", err);
    return json({ error: "Failed to load claim receipt logs" }, { status: 500 });
  }
};
