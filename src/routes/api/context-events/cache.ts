/**
 * Pure cache-decision helpers for the Context-event scanner.
 *
 * These are split out from +server.ts so the parts that decide *whether to trust
 * and persist a scan* can be unit-tested without axios / Vercel Blob / $env. The
 * bug they exist to prevent: a failed or partial Hypersync scan being treated as
 * authoritative — overwriting a good cache with an empty set and serving claimed=0,
 * which produced the non-deterministic 867 -> 0 -> 867 claim flicker.
 */

export interface CachedLog {
  block_number: string;
  log_index: string;
  transaction_index: string;
  transaction_hash: string;
  data: string;
  address: string;
  topic0: string;
  timestamp: number | null;
}

export interface BlobCacheData {
  logs: CachedLog[];
  // Lowest block the cache has been scanned FROM. Without this, a request for an
  // older range than was previously cached would be served a truncated set (the
  // cache only knew its upper bound). Older blobs may omit it — inferred on read.
  lowWaterBlock?: number;
  highWaterBlock: number;
  updatedAt: number;
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
      logs: result.logs,
      lowWaterBlock: scanFrom,
      highWaterBlock: result.nextBlock,
      updatedAt: now,
    },
    persist: true,
  };
}
