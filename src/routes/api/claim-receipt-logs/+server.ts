import { json, type RequestHandler } from "@sveltejs/kit";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

// A larger batch would tie up the function for a long time (one slow/stuck RPC
// call per hash, run serially) — cap it and make the caller re-request in
// smaller batches rather than let one request run indefinitely.
const MAX_TRANSACTION_HASHES = 200;
const RPC_TIMEOUT_MS = 10_000;
const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { transactionHashes, orderbookAddress } = (await request.json()) as {
      transactionHashes?: unknown;
      orderbookAddress?: unknown;
    };

    if (!transactionHashes || !orderbookAddress) {
      return json({ logs: [] });
    }

    if (
      typeof orderbookAddress !== "string" ||
      !HEX_ADDRESS_RE.test(orderbookAddress)
    ) {
      return json({ error: "orderbookAddress must be a 0x address" }, { status: 400 });
    }

    if (!Array.isArray(transactionHashes)) {
      return json({ error: "transactionHashes must be an array" }, { status: 400 });
    }

    if (transactionHashes.length === 0) {
      return json({ logs: [] });
    }

    if (transactionHashes.length > MAX_TRANSACTION_HASHES) {
      return json(
        {
          error: `transactionHashes exceeds max batch size of ${MAX_TRANSACTION_HASHES}`,
        },
        { status: 400 },
      );
    }

    if (!transactionHashes.every((h) => typeof h === "string" && HEX_HASH_RE.test(h))) {
      return json({ error: "transactionHashes must be 0x tx hashes" }, { status: 400 });
    }

    const hashes = transactionHashes as string[];

    const client = createPublicClient({
      chain: base,
      // A stuck RPC would otherwise hang the whole request (and every hash
      // behind it) up to the platform's function timeout.
      transport: http(undefined, { timeout: RPC_TIMEOUT_MS }),
    });

    const normalizedOrderbook = orderbookAddress.toLowerCase();

    // Fetch all receipts in parallel instead of one-at-a-time.
    const receipts = await Promise.all(
      hashes.map((hash) =>
        client.getTransactionReceipt({ hash: hash as `0x${string}` }),
      ),
    );

    // Multiple receipts commonly share a block — fetch each distinct block once.
    const blockNumbers = [...new Set(receipts.map((r) => r.blockNumber))];
    const blocks = await Promise.all(
      blockNumbers.map((blockNumber) => client.getBlock({ blockNumber })),
    );
    const timestampByBlock = new Map<bigint, number>(
      blocks.map((block, i) => [
        blockNumbers[i],
        typeof block.timestamp === "bigint"
          ? Number(block.timestamp)
          : Number(block.timestamp),
      ]),
    );

    const logs: Array<{
      block_number: string;
      transaction_hash: string;
      data: string;
      timestamp: number | null;
    }> = [];

    for (let i = 0; i < receipts.length; i += 1) {
      const receipt = receipts[i];
      const hash = hashes[i];
      const blockTimestamp = timestampByBlock.get(receipt.blockNumber) ?? null;

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
