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
import {
  mergeLogs,
  planFullScanResult,
  type BlobCacheData,
  type CachedLog,
  type ScanResult,
} from "./cache";
import {
  decodeContextData,
  type DecodedContext,
} from "$lib/utils/contextLogDecode";

/**
 * Compact per-log wire shape returned to the client. The heavy `data` ABI blob
 * (the bulk of a 30MB+ v4 scan) is dropped in favour of `ctx`, the pre-decoded
 * Context payload — so the browser never re-decodes ~16.5k logs on every load.
 */
interface WireLog {
  block_number: string;
  transaction_hash: string;
  timestamp: number | null;
  ctx: DecodedContext | null;
}

// Decode a scanned log set exactly ONCE per process, keyed on the log ARRAY
// identity. `mergeLogs` returns a fresh array on every delta, so a changed set
// misses the cache and re-decodes; a warm no-delta request hits it and just
// filters + serializes. This is the server-side twin of the client's
// `decodeClaimLogsMemoised`, moved here so the decode cost is paid once total
// rather than once per browser per load.
const decodedCtxCache = new WeakMap<CachedLog[], (DecodedContext | null)[]>();

function decodedCtxFor(logs: CachedLog[]): (DecodedContext | null)[] {
  let decoded = decodedCtxCache.get(logs);
  if (!decoded) {
    decoded = logs.map((log) => decodeContextData(log.data));
    decodedCtxCache.set(logs, decoded);
  }
  return decoded;
}

// Build the compact response for a cache: pre-decoded Context payloads, no raw
// `data`, filtered to [requestedFrom, tip].
function toWireLogs(cache: BlobCacheData, requestedFrom: number): WireLog[] {
  const ctxAll = decodedCtxFor(cache.logs);
  const out: WireLog[] = [];
  for (let i = 0; i < cache.logs.length; i += 1) {
    const log = cache.logs[i];
    if (Number(log.block_number) < requestedFrom) continue;
    out.push({
      block_number: log.block_number,
      transaction_hash: log.transaction_hash,
      timestamp: log.timestamp,
      ctx: ctxAll[i] ?? null,
    });
  }
  return out;
}

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

const HYPERSYNC_URL = "https://8453.hypersync.xyz/query";
const MIN_REFETCH_INTERVAL_MS = 30_000;

function normalizeEventTopics(
  eventTopic: string | undefined,
  eventTopics: string[] | undefined,
): string[] {
  const topics =
    eventTopics?.filter((t) => typeof t === "string" && t.startsWith("0x")) ??
    [];
  if (topics.length > 0) return [...new Set(topics.map((t) => t.toLowerCase()))];
  if (eventTopic?.startsWith("0x")) return [eventTopic.toLowerCase()];
  return [];
}

// Cache key is per OrderBook + topic set — eras must not share a cache entry.
function blobKey(contractAddress: string, eventTopics: string[]): string {
  const topicKey = eventTopics
    .map((t) => t.slice(2, 10))
    .sort()
    .join("-");
  return `hypersync-context-events-${contractAddress.toLowerCase()}-${topicKey}.json`;
}

// In-memory layer (fast path, avoids Blob reads on warm instances), keyed per contract.
const memCache = new Map<string, BlobCacheData>();

// Single-flight for full re-scans, keyed by `${blobKey}:${scanFrom}`. A cold or
// stale-floored cache hit by several requests at once (e.g. portfolio + claims pages
// loading together for the same wallet) would otherwise each kick off a 20-100s scan,
// hammering Hypersync — which raises the rate-limit/error odds that poison the cache —
// and racing each other's writes. Concurrent callers with the same floor share one scan.
const inFlightFullScan = new Map<string, Promise<BlobCacheData | null>>();

/**
 * Load cache: try in-memory first, then Vercel Blob
 */
async function loadCache(
  contractAddress: string,
  eventTopics: string[],
): Promise<BlobCacheData | null> {
  const key = blobKey(contractAddress, eventTopics);
  const mem = memCache.get(key);
  if (mem) return mem;

  try {
    // Check if blob exists
    const blobMeta: HeadBlobResult | null = await head(key).catch(() => null);
    if (!blobMeta?.url) return null;

    const response = await fetch(blobMeta.url);
    if (!response.ok) return null;

    const data: BlobCacheData = await response.json();
    memCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Save cache to both in-memory and Vercel Blob
 */
async function saveCache(
  contractAddress: string,
  eventTopics: string[],
  data: BlobCacheData,
): Promise<void> {
  const key = blobKey(contractAddress, eventTopics);
  memCache.set(key, data);

  try {
    await put(key, JSON.stringify(data), {
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
  eventTopics: string[],
  fromBlock: number,
): Promise<ScanResult> {
  const allLogs: CachedLog[] = [];
  let currentBlock = fromBlock;

  while (true) {
    try {
      const body: Record<string, unknown> = {
        from_block: currentBlock,
        logs: [
          {
            address: [contractAddress],
            topics: [eventTopics],
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
      // Malformed/empty page mid-scan: treat as a FAILED scan, not "this range has
      // these (partial) logs". Returning ok:false stops the caller persisting it.
      if (!responseData?.data) {
        return { ok: false, logs: allLogs, nextBlock: currentBlock };
      }

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
          ok: true,
          logs: allLogs,
          nextBlock: responseData.next_block || currentBlock,
        };
      }

      currentBlock = responseData.next_block;
    } catch (error) {
      console.warn("Hypersync fetch error in context-events:", error);
      // Bail with whatever we have, flagged as incomplete so it isn't persisted.
      return { ok: false, logs: allLogs, nextBlock: currentBlock };
    }
  }
}

export async function POST({ request }: RequestEvent) {
  try {
    const body = await request.json();
    const { contractAddress, eventTopic, eventTopics, fromBlock, forceRefresh } =
      body;

    const topics = normalizeEventTopics(eventTopic, eventTopics);

    if (!contractAddress || topics.length === 0 || !fromBlock) {
      return json(
        {
          error:
            "contractAddress, eventTopic or eventTopics, and fromBlock are required",
        },
        { status: 400 },
      );
    }

    const requestedFrom = Number(fromBlock);
    const now = Date.now();

    // Try to load existing cache (in-memory → Blob), keyed per OrderBook contract
    const cached = await loadCache(contractAddress, topics);
    const shouldDelta =
      forceRefresh === true || now - (cached?.updatedAt ?? 0) > MIN_REFETCH_INTERVAL_MS;

    // Lower bound of what the cache actually scanned. Older blobs predate
    // `lowWaterBlock`, so infer it from the lowest cached log; if there are no
    // logs we can't know how low it scanned, so treat it as "covers nothing"
    // (null) and force a fresh scan rather than serve a possibly-truncated set.
    const cachedLow =
      cached == null
        ? null
        : cached.lowWaterBlock ??
          (cached.logs.length ? Number(cached.logs[0].block_number) : null);

    // Fast path: the cache fully covers [requestedFrom, tip] — its lower bound is
    // known AND at/below the requested block, and its high-water mark is at/above it.
    if (
      cached &&
      cachedLow !== null &&
      cachedLow <= requestedFrom &&
      cached.highWaterBlock >= requestedFrom
    ) {
      // Delta fetch after a claim (forceRefresh) or on the refetch interval.
      if (shouldDelta) {
        // Scan from highWaterBlock *inclusive*: it holds Hypersync's next_block (the
        // next block to scan), so the old `+ 1` skipped that block every delta,
        // silently dropping any claim event that landed on a watermark. mergeLogs
        // de-dupes the boundary overlap.
        const delta = await fetchFromHypersync(
          contractAddress,
          topics,
          cached.highWaterBlock,
        );

        // Only advance + persist when the scan actually completed. A failed/partial
        // delta (ok:false) is ignored so we keep serving the good cache rather than
        // dropping logs or advancing the watermark past an unscanned range.
        if (delta.ok) {
          cached.logs = mergeLogs(cached.logs, delta.logs);
          cached.highWaterBlock = Math.max(
            cached.highWaterBlock,
            delta.nextBlock,
          );
          cached.updatedAt = now;
          saveCache(contractAddress, topics, cached).catch(() => {});
        }
      }

      return json({ logs: toWireLogs(cached, requestedFrom), fromCache: true });
    }

    // Cache miss, OR the cache doesn't reach down to requestedFrom (an older range
    // was requested than what was previously scanned), OR requestedFrom is newer
    // than the cached tip. Scan from the lowest of {requestedFrom, existing lower
    // bound} so we never lose coverage we already had, and rebuild the cache with
    // an explicit lowWaterBlock. This makes a stale high-floored cache self-heal:
    // the next request for an older block backfills instead of silently truncating.
    const scanFrom =
      cached && cachedLow !== null
        ? Math.min(requestedFrom, cachedLow)
        : requestedFrom;

    // Single-flight the rebuild (keyed by contract+topics+floor) so concurrent
    // requests for the same range share one scan instead of racing.
    const flightKey = `${blobKey(contractAddress, topics)}:${scanFrom}`;
    let flight = inFlightFullScan.get(flightKey);
    if (!flight) {
      flight = (async (): Promise<BlobCacheData | null> => {
        const result = await fetchFromHypersync(contractAddress, topics, scanFrom);
        // planFullScanResult refuses to overwrite a good cache or persist a
        // partial/empty set when the scan failed (ok:false) — the fix for the
        // 867 -> 0 -> 867 flicker. On failure it returns the existing cache (stale).
        const { cache, persist } = planFullScanResult(
          cached,
          result,
          scanFrom,
          Date.now(),
        );
        if (persist && cache) {
          saveCache(contractAddress, topics, cache).catch(() => {});
        }
        return cache;
      })().finally(() => inFlightFullScan.delete(flightKey));
      inFlightFullScan.set(flightKey, flight);
    }

    const rebuilt = await flight;

    // Scan failed and there was no prior cache to fall back to: serve nothing this
    // time WITHOUT persisting, so the next request retries a clean scan rather than
    // inheriting a poisoned empty cache. 503 signals "transient, retry".
    if (!rebuilt) {
      return json(
        { logs: [], fromCache: false, error: "scan_unavailable" },
        { status: 503 },
      );
    }

    return json({
      logs: toWireLogs(rebuilt, requestedFrom),
      fromCache: rebuilt === cached,
    });
  } catch (err) {
    console.error("Context events error:", err);
    return json({ error: "Failed to fetch context events" }, { status: 500 });
  }
}
