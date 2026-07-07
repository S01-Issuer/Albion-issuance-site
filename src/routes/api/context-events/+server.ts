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
 *
 * Storage format v2: logs are persisted in the compact pre-decoded form
 * (`ctx`, no raw ABI `data`) under a v2 blob key, shrinking the v4 blob from
 * ~30MB to ~4MB — the cold-start cost is one small fetch + parse, with zero
 * per-request ABI decoding. Legacy (v1) blobs under the old key are migrated
 * on first read (one decode pass, no Hypersync rescan) and left untouched so
 * a rolled-back deployment still finds its own format.
 */
import { json, type RequestEvent } from "@sveltejs/kit";
import { put, head, type HeadBlobResult } from "@vercel/blob";
import axios from "axios";
import { PRIVATE_HYPERSYNC_API_KEY } from "$env/static/private";
import { ORDERBOOK_SOURCES } from "$lib/network";
import {
  mergeLogs,
  migrateCacheData,
  planFullScanResult,
  toCompactLog,
  toWireLogs,
  type BlobCacheData,
  type CachedLog,
  type LegacyBlobCacheData,
  type ScanResult,
} from "./cache";

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

// Only scan known OrderBook contracts — an arbitrary address would let a caller
// point Hypersync at anything (and force a full-history scan of it), and would
// grow the memCache/Blob key space unboundedly.
function isAllowedContractAddress(address: unknown): address is string {
  if (typeof address !== "string") return false;
  const lower = address.toLowerCase();
  return ORDERBOOK_SOURCES.some((s) => s.address.toLowerCase() === lower);
}

// Cache key is per OrderBook + topic set — eras must not share a cache entry.
function topicKeyOf(eventTopics: string[]): string {
  return eventTopics
    .map((t) => t.slice(2, 10))
    .sort()
    .join("-");
}

/**
 * v2 (compact-format) blob key. Deliberately DIFFERENT from the legacy key:
 * an older deployment reading a compact blob would decode the missing `data`
 * field to ctx=null on every log and serve claimed=0 for everyone. Separate
 * keys make both directions of a deploy/rollback read a format they understand.
 */
function blobKey(contractAddress: string, eventTopics: string[]): string {
  return `hypersync-context-events-v2-${contractAddress.toLowerCase()}-${topicKeyOf(eventTopics)}.json`;
}

/** Legacy (v1, raw-log) blob key — read-only fallback for migration. */
function legacyBlobKey(
  contractAddress: string,
  eventTopics: string[],
): string {
  return `hypersync-context-events-${contractAddress.toLowerCase()}-${topicKeyOf(eventTopics)}.json`;
}

// In-memory layer (fast path, avoids Blob reads on warm instances), keyed per contract.
// The key space is bounded (allowlisted contracts × fixed topic sets), but cap it
// defensively anyway — if it ever somehow grows past this, just clear it rather than
// leak memory indefinitely. A cold-start-equivalent Blob re-read is cheap.
const MEM_CACHE_MAX_ENTRIES = 32;
const memCache = new Map<string, BlobCacheData>();

function setMemCache(key: string, value: BlobCacheData): void {
  if (memCache.size >= MEM_CACHE_MAX_ENTRIES && !memCache.has(key)) {
    memCache.clear();
  }
  memCache.set(key, value);
}

// Single-flight for full re-scans, keyed by `${blobKey}:${scanFrom}`. A cold or
// stale-floored cache hit by several requests at once (e.g. portfolio + claims pages
// loading together for the same wallet) would otherwise each kick off a 20-100s scan,
// hammering Hypersync — which raises the rate-limit/error odds that poison the cache —
// and racing each other's writes. Concurrent callers with the same floor share one scan.
const inFlightFullScan = new Map<string, Promise<BlobCacheData | null>>();

async function fetchBlobJson<T>(key: string): Promise<T | null> {
  try {
    const blobMeta: HeadBlobResult | null = await head(key).catch(() => null);
    if (!blobMeta?.url) return null;

    const response = await fetch(blobMeta.url);
    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Load cache: in-memory → v2 Blob → legacy (v1) Blob. A legacy hit is migrated
 * to the compact format (one decode pass) and persisted under the v2 key so the
 * cost is paid once, not per cold instance. The legacy blob is never written
 * again — it just goes stale, which is harmless.
 */
async function loadCache(
  contractAddress: string,
  eventTopics: string[],
): Promise<BlobCacheData | null> {
  const key = blobKey(contractAddress, eventTopics);
  const mem = memCache.get(key);
  if (mem) return mem;

  const v2 = await fetchBlobJson<BlobCacheData>(key);
  if (v2) {
    setMemCache(key, v2);
    return v2;
  }

  const legacy = await fetchBlobJson<LegacyBlobCacheData>(
    legacyBlobKey(contractAddress, eventTopics),
  );
  if (!legacy) return null;

  // A corrupt/malformed legacy blob (e.g. non-array `logs`) must not throw here —
  // an uncaught error surfaces as a 500, which the client treats as claimed=0.
  // Treat it as a cache miss instead: the caller falls through to a clean rescan.
  let cache: BlobCacheData;
  try {
    ({ cache } = migrateCacheData(legacy));
  } catch (error) {
    console.warn("Failed to migrate legacy context-events blob:", error);
    return null;
  }
  // Persist the migrated compact blob fire-and-forget; serving doesn't wait on it.
  saveCache(contractAddress, eventTopics, cache).catch(() => {});
  return cache;
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
  setMemCache(key, data);

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
          // Decode at scan time — the raw ABI `data` never leaves this loop.
          allLogs.push(
            toCompactLog({
              ...log,
              timestamp: blockMap.get(log.block_number) ?? null,
            }),
          );
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
    const {
      contractAddress,
      eventTopic,
      eventTopics,
      fromBlock,
      forceRefresh,
      owner,
    } = body;

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

    if (!isAllowedContractAddress(contractAddress)) {
      return json(
        { error: "contractAddress is not a known OrderBook address" },
        { status: 400 },
      );
    }

    // A huge full-history scan from block 1 (or a bogus/negative/non-numeric
    // value) is an easy DoS against Hypersync — reject rather than serve it.
    const fromBlockNum = Number(fromBlock);
    if (!Number.isFinite(fromBlockNum) || fromBlockNum < 1) {
      return json(
        { error: "fromBlock must be a positive block number" },
        { status: 400 },
      );
    }

    // Optional response filter: only logs whose Context sender is this wallet.
    // Purely a serialization-time filter — the shared cache stays wallet-independent.
    const ownerFilter =
      typeof owner === "string" && owner.startsWith("0x") ? owner : undefined;

    const requestedFrom = fromBlockNum;
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

      return json({
        logs: toWireLogs(cached, requestedFrom, ownerFilter),
        fromCache: true,
      });
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
      logs: toWireLogs(rebuilt, requestedFrom, ownerFilter),
      fromCache: rebuilt === cached,
    });
  } catch (err) {
    console.error("Context events error:", err);
    return json({ error: "Failed to fetch context events" }, { status: 500 });
  }
}
