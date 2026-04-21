/**
 * Server-side cached Context event scanner.
 *
 * Maintains an in-memory cache of all Context events from the orderbook
 * contract. On each request, only fetches blocks since the last scan
 * (high-water-mark pattern). On Vercel Fluid Compute, the cache persists
 * across requests within the same function instance.
 *
 * Client makes 1 request here instead of 4-6 chunked Hypersync requests.
 */
import { json, type RequestEvent } from "@sveltejs/kit";
import axios from "axios";
import { PRIVATE_HYPERSYNC_API_KEY } from "$env/static/private";

interface HypersyncBlock {
  number: string;
  timestamp: string;
}

interface HypersyncLog {
  block_number: string;
  log_index: string;
  transaction_index: string;
  transaction_hash: string;
  data: string;
  address: string;
  topic0: string;
}

interface HypersyncEntry {
  blocks: HypersyncBlock[];
  logs: HypersyncLog[];
}

interface HypersyncResponseData {
  data: HypersyncEntry[];
  next_block: number;
}

interface CachedLog {
  block_number: string;
  log_index: string;
  transaction_index: string;
  transaction_hash: string;
  data: string;
  address: string;
  topic0: string;
  timestamp: number | null;
}

// In-memory cache — persists across requests in Vercel Fluid Compute
const cache = {
  logs: [] as CachedLog[],
  highWaterBlock: 0,
  lastFetchTime: 0,
};

// Don't re-fetch if less than 30s since last fetch
const MIN_REFETCH_INTERVAL_MS = 30_000;

const HYPERSYNC_URL = "https://8453.hypersync.xyz/query";

async function fetchFromHypersync(
  contractAddress: string,
  eventTopic: string,
  fromBlock: number,
  toBlock?: number,
): Promise<{ logs: CachedLog[]; nextBlock: number }> {
  const allLogs: CachedLog[] = [];
  let currentBlock = fromBlock;

  while (true) {
    try {
      const body: Record<string, unknown> = {
        from_block: currentBlock,
        logs: [
          {
            address: [contractAddress],
            topics: [[eventTopic]],
          },
        ],
        field_selection: {
          log: [
            "block_number",
            "log_index",
            "transaction_index",
            "transaction_hash",
            "data",
            "address",
            "topic0",
          ],
          block: ["number", "timestamp"],
        },
      };
      if (toBlock !== undefined) {
        body.to_block = toBlock;
      }

      const res = await axios.post<HypersyncResponseData>(HYPERSYNC_URL, body, {
        headers: {
          Authorization: `Bearer ${PRIVATE_HYPERSYNC_API_KEY}`,
        },
      });

      const responseData = res.data;
      if (!responseData?.data) break;

      // Flatten entries into cached logs with timestamps
      for (const entry of responseData.data) {
        const blockMap = new Map(
          entry.blocks.map((b) => [
            b.number,
            Number.parseInt(b.timestamp, 16),
          ]),
        );

        for (const log of entry.logs) {
          allLogs.push({
            ...log,
            timestamp: blockMap.get(log.block_number) ?? null,
          });
        }
      }

      if (
        !responseData.next_block ||
        responseData.next_block <= currentBlock
      ) {
        return { logs: allLogs, nextBlock: responseData.next_block || currentBlock };
      }
      if (toBlock !== undefined && responseData.next_block >= toBlock) {
        return { logs: allLogs, nextBlock: responseData.next_block };
      }

      currentBlock = responseData.next_block;
    } catch (error) {
      console.warn("Hypersync fetch error in context-events:", error);
      break;
    }
  }

  return { logs: allLogs, nextBlock: currentBlock };
}

export async function POST({ request }: RequestEvent) {
  try {
    const body = await request.json();
    const { contractAddress, eventTopic, fromBlock } = body;

    if (!contractAddress || !eventTopic || !fromBlock) {
      return json(
        { error: "contractAddress, eventTopic, and fromBlock are required" },
        { status: 400 },
      );
    }

    const requestedFrom = Number(fromBlock);
    const now = Date.now();

    // If cache has data and covers the requested range, check if we need delta fetch
    if (
      cache.highWaterBlock > 0 &&
      cache.highWaterBlock >= requestedFrom
    ) {
      // Only fetch new blocks if enough time has passed
      if (now - cache.lastFetchTime > MIN_REFETCH_INTERVAL_MS) {
        const delta = await fetchFromHypersync(
          contractAddress,
          eventTopic,
          cache.highWaterBlock + 1,
        );
        if (delta.logs.length > 0) {
          cache.logs.push(...delta.logs);
        }
        cache.highWaterBlock = Math.max(cache.highWaterBlock, delta.nextBlock);
        cache.lastFetchTime = now;
      }

      // Return cached logs filtered to requested range
      const filtered = cache.logs.filter(
        (log) => Number(log.block_number) >= requestedFrom,
      );
      return json({ logs: filtered, fromCache: true });
    }

    // Cache miss or requested range starts before cache — do full fetch
    // Use the earlier of requestedFrom and any existing cache start
    const scanFrom = cache.highWaterBlock > 0
      ? Math.min(requestedFrom, Number(cache.logs[0]?.block_number || requestedFrom))
      : requestedFrom;

    const result = await fetchFromHypersync(
      contractAddress,
      eventTopic,
      scanFrom,
    );

    cache.logs = result.logs;
    cache.highWaterBlock = result.nextBlock;
    cache.lastFetchTime = now;

    const filtered = result.logs.filter(
      (log) => Number(log.block_number) >= requestedFrom,
    );
    return json({ logs: filtered, fromCache: false });
  } catch (err) {
    console.error("Context events error:", err);
    return json({ error: "Failed to fetch context events" }, { status: 500 });
  }
}
