/**
 * Server-side cached Context event scanner with Vercel Blob persistence.
 *
 * Two-layer cache:
 * 1. In-memory (fast, lost on cold start)
 * 2. Vercel Blob (durable, survives cold starts and deployments)
 *
 * High-water-mark pattern: stores all events up to block N.
 * On each request, only fetches blocks N+1 → chain tip.
 * Even after weeks of no traffic, cold start only fetches the delta.
 */
import { json, type RequestEvent } from "@sveltejs/kit";
import { put, head, type HeadBlobResult } from "@vercel/blob";
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

interface BlobCacheData {
  logs: CachedLog[];
  highWaterBlock: number;
  updatedAt: number;
}

const BLOB_KEY = "hypersync-context-events.json";
const HYPERSYNC_URL = "https://8453.hypersync.xyz/query";
const MIN_REFETCH_INTERVAL_MS = 30_000;

// In-memory layer (fast path, avoids Blob reads on warm instances)
let memCache: BlobCacheData | null = null;

/**
 * Load cache: try in-memory first, then Vercel Blob
 */
async function loadCache(): Promise<BlobCacheData | null> {
  if (memCache) return memCache;

  try {
    // Check if blob exists
    const blobMeta: HeadBlobResult | null = await head(BLOB_KEY).catch(
      () => null,
    );
    if (!blobMeta?.url) return null;

    const response = await fetch(blobMeta.url);
    if (!response.ok) return null;

    const data: BlobCacheData = await response.json();
    memCache = data;
    return data;
  } catch {
    return null;
  }
}

/**
 * Save cache to both in-memory and Vercel Blob
 */
async function saveCache(data: BlobCacheData): Promise<void> {
  memCache = data;

  try {
    await put(BLOB_KEY, JSON.stringify(data), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
    });
  } catch (error) {
    console.warn("Failed to save context events to Blob:", error);
    // In-memory cache still works for this instance
  }
}

async function fetchFromHypersync(
  contractAddress: string,
  eventTopic: string,
  fromBlock: number,
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

      const res = await axios.post<HypersyncResponseData>(
        HYPERSYNC_URL,
        body,
        {
          headers: {
            Authorization: `Bearer ${PRIVATE_HYPERSYNC_API_KEY}`,
          },
        },
      );

      const responseData = res.data;
      if (!responseData?.data) break;

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
        return {
          logs: allLogs,
          nextBlock: responseData.next_block || currentBlock,
        };
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

    // Try to load existing cache (in-memory → Blob)
    const cached = await loadCache();

    if (cached && cached.highWaterBlock >= requestedFrom) {
      // Cache covers the requested range — check if we need a delta fetch
      if (now - cached.updatedAt > MIN_REFETCH_INTERVAL_MS) {
        const delta = await fetchFromHypersync(
          contractAddress,
          eventTopic,
          cached.highWaterBlock + 1,
        );

        if (delta.logs.length > 0) {
          cached.logs.push(...delta.logs);
        }
        cached.highWaterBlock = Math.max(
          cached.highWaterBlock,
          delta.nextBlock,
        );
        cached.updatedAt = now;

        // Save updated cache (fire-and-forget to not block response)
        saveCache(cached).catch(() => {});
      }

      const filtered = cached.logs.filter(
        (log) => Number(log.block_number) >= requestedFrom,
      );
      return json({ logs: filtered, fromCache: true });
    }

    // Cache miss — full scan from requested block
    const scanFrom =
      cached && cached.highWaterBlock > 0
        ? Math.min(
            requestedFrom,
            Number(cached.logs[0]?.block_number || requestedFrom),
          )
        : requestedFrom;

    const result = await fetchFromHypersync(
      contractAddress,
      eventTopic,
      scanFrom,
    );

    const newCache: BlobCacheData = {
      logs: result.logs,
      highWaterBlock: result.nextBlock,
      updatedAt: now,
    };

    // Save to both layers (fire-and-forget)
    saveCache(newCache).catch(() => {});

    const filtered = result.logs.filter(
      (log) => Number(log.block_number) >= requestedFrom,
    );
    return json({ logs: filtered, fromCache: false });
  } catch (err) {
    console.error("Context events error:", err);
    return json({ error: "Failed to fetch context events" }, { status: 500 });
  }
}
