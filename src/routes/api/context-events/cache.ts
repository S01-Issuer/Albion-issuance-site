/**
 * Pure cache-decision helpers for the Context-event scanner.
 *
 * These are split out from +server.ts so the parts that decide *whether to trust
 * and persist a scan* can be unit-tested without axios / Vercel Blob / $env. The
 * bug they exist to prevent: a failed or partial Hypersync scan being treated as
 * authoritative — overwriting a good cache with an empty set and serving claimed=0,
 * which produced the non-deterministic 867 -> 0 -> 867 claim flicker.
 */
import {
  decodeContextData,
  type DecodedContext,
} from "$lib/utils/contextLogDecode";

/**
 * Raw log shape as returned by a Hypersync scan — and as stored by legacy (v1)
 * cache blobs, whose `data` field made the v4 blob ~30MB and dominated the
 * cold-start cost (fetch + parse + 8.9k ABI decodes per cold instance).
 */
export interface RawScannedLog {
  block_number: string;
  log_index: string;
  transaction_index?: string;
  transaction_hash: string;
  data: string;
  address?: string;
  topic0?: string;
  timestamp: number | null;
}

/**
 * Compact stored log (format v2): the Context payload is decoded ONCE, at scan
 * (or migration) time, and persisted as `ctx`; the raw ABI `data` blob is
 * dropped. `ctx: null` entries (undecodable / non-claim events) are kept so the
 * stored set remains exactly "everything Hypersync returned in range" — merge
 * and dedupe semantics don't depend on decodability.
 */
export interface CachedLog {
  block_number: string;
  log_index: string;
  transaction_hash: string;
  timestamp: number | null;
  ctx: DecodedContext | null;
}

/**
 * Bumped when the stored log shape changes. v2 blobs live under a DIFFERENT
 * blob key than legacy ones (see blobKey in +server.ts): a rolled-back
 * deployment must never read a format it would misparse — decoding a missing
 * `data` field yields ctx=null for every log, i.e. claimed=0 for everyone.
 */
export const CACHE_FORMAT_VERSION = 2;

export interface BlobCacheData {
  /** Absent on legacy (v1) blobs; CACHE_FORMAT_VERSION on compact ones. */
  formatVersion?: number;
  logs: CachedLog[];
  // Lowest block the cache has been scanned FROM. Without this, a request for an
  // older range than was previously cached would be served a truncated set (the
  // cache only knew its upper bound). Older blobs may omit it — inferred on read.
  lowWaterBlock?: number;
  highWaterBlock: number;
  updatedAt: number;
}

/** Legacy (v1) blob shape: raw logs, no formatVersion. */
export interface LegacyBlobCacheData {
  logs: RawScannedLog[];
  lowWaterBlock?: number;
  highWaterBlock: number;
  updatedAt: number;
}

/** Decode a freshly-scanned raw log into the compact stored form. */
export function toCompactLog(raw: RawScannedLog): CachedLog {
  return {
    block_number: raw.block_number,
    log_index: raw.log_index,
    transaction_hash: raw.transaction_hash,
    timestamp: raw.timestamp,
    ctx: decodeContextData(raw.data),
  };
}

/**
 * Normalise a loaded blob to the compact v2 format. Legacy blobs are migrated
 * in place — each raw log is decoded once and its `data` dropped — so upgrading
 * costs one decode pass (same work the old cold path did per instance), NOT a
 * full Hypersync rescan. Watermarks and updatedAt are preserved so delta-scan
 * timing behaves identically. `migrated` tells the caller to persist the result.
 */
export function migrateCacheData(
  data: BlobCacheData | LegacyBlobCacheData,
): { cache: BlobCacheData; migrated: boolean } {
  if ((data as BlobCacheData).formatVersion === CACHE_FORMAT_VERSION) {
    return { cache: data as BlobCacheData, migrated: false };
  }
  const legacy = data as LegacyBlobCacheData;
  return {
    cache: {
      formatVersion: CACHE_FORMAT_VERSION,
      logs: legacy.logs.map(toCompactLog),
      lowWaterBlock: legacy.lowWaterBlock,
      highWaterBlock: legacy.highWaterBlock,
      updatedAt: legacy.updatedAt,
    },
    migrated: true,
  };
}

/** Outcome of a Hypersync scan. `ok=false` means it errored or returned a
 *  malformed page partway through, so `logs` is partial and MUST NOT be treated
 *  as a complete "this range has these logs" answer. */
export interface ScanResult {
  ok: boolean;
  logs: CachedLog[];
  nextBlock: number;
}

const logKey = (l: CachedLog): string => `${l.block_number}:${l.log_index}`;

/**
 * Merge freshly-scanned logs into the existing set, de-duplicated by
 * (block_number, log_index). De-duping makes appends idempotent, so an overlapping
 * delta re-scan (we now scan from highWaterBlock *inclusive* to avoid skipping that
 * block) or two concurrent deltas can't double-insert the same event.
 */
export function mergeLogs(
  existing: CachedLog[],
  incoming: CachedLog[],
): CachedLog[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map(logKey));
  const merged = existing.slice();
  for (const log of incoming) {
    const k = logKey(log);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(log);
    }
  }
  return merged;
}

/**
 * Decide the next cache state after a full (re)scan.
 *
 * The whole point: a scan that did NOT complete (`ok=false`) must never overwrite
 * a good cache or be persisted as an empty/partial set. On failure we fall back to
 * the existing cache (serve stale) and signal `persist:false`; only a completed
 * scan rebuilds and persists.
 */
export function planFullScanResult(
  cached: BlobCacheData | null,
  result: ScanResult,
  scanFrom: number,
  now: number,
): { cache: BlobCacheData | null; persist: boolean } {
  if (!result.ok) {
    return { cache: cached ?? null, persist: false };
  }
  return {
    cache: {
      formatVersion: CACHE_FORMAT_VERSION,
      logs: result.logs,
      lowWaterBlock: scanFrom,
      highWaterBlock: result.nextBlock,
      updatedAt: now,
    },
    persist: true,
  };
}

/**
 * Compact per-log wire shape returned to the client: the pre-decoded Context
 * payload, never the raw ABI `data`.
 */
export interface WireLog {
  block_number: string;
  transaction_hash: string;
  timestamp: number | null;
  ctx: DecodedContext | null;
}

/**
 * Serialize a cache for the response: filtered to [requestedFrom, tip] and —
 * when `owner` is given — to logs whose Context sender is that wallet. Claimed-
 * detection matches logs to CSV rows by that same sender address
 * (decodedLogMatchesClaim), so an owner-scoped response is exactly the subset
 * this wallet's claims pipeline can ever use; it turns a ~3.5MB every-wallet
 * payload into a few KB. Owner filtering drops ctx-null logs (the client drops
 * them anyway). No-owner requests keep the full-set behaviour.
 */
export function toWireLogs(
  cache: BlobCacheData,
  requestedFrom: number,
  owner?: string,
): WireLog[] {
  const ownerLower = owner?.toLowerCase();
  const out: WireLog[] = [];
  for (const log of cache.logs) {
    if (Number(log.block_number) < requestedFrom) continue;
    if (ownerLower && log.ctx?.address?.toLowerCase() !== ownerLower) continue;
    out.push({
      block_number: log.block_number,
      transaction_hash: log.transaction_hash,
      timestamp: log.timestamp,
      ctx: log.ctx,
    });
  }
  return out;
}
