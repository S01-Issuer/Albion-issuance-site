import { describe, it, expect } from "vitest";
import { encodeAbiParameters } from "viem";
import {
  CACHE_FORMAT_VERSION,
  mergeLogs,
  migrateCacheData,
  planFullScanResult,
  toCompactLog,
  toWireLogs,
  type BlobCacheData,
  type CachedLog,
  type LegacyBlobCacheData,
  type RawScannedLog,
  type ScanResult,
} from "./cache";

const OWNER = "0x8f6bF4A948Af2Fc74eE34982C4435a7C013D1A52";
const OTHER = "0x1111111111111111111111111111111111111111";
const ORDER_HASH_WORD = 42n;

/** Real-shape Context payload: (address sender, uint256[][] context) with the
 *  order hash in calling-context col[1][0] and index/amount in a signing column. */
function contextData(sender: string, index: bigint, amount: bigint): string {
  return encodeAbiParameters(
    [{ type: "address" }, { type: "uint256[][]" }],
    [
      sender as `0x${string}`,
      [
        [1n],
        [ORDER_HASH_WORD, 2n, 3n], // calling context: [orderHash, owner, counterparty]
        [],
        [],
        [],
        [],
        [index, amount], // signing column claimed-detection reads first
      ],
    ],
  );
}

const log = (
  block: string,
  index: string,
  over: Partial<CachedLog> = {},
): CachedLog => ({
  block_number: block,
  log_index: index,
  transaction_hash: `0x${block}${index}`,
  timestamp: 1,
  ctx: {
    orderHash: "0xoh",
    index: "81",
    address: OWNER,
    amount: "5",
  },
  ...over,
});

const rawLog = (
  block: string,
  index: string,
  data: string,
): RawScannedLog => ({
  block_number: block,
  log_index: index,
  transaction_index: "0",
  transaction_hash: `0x${block}${index}`,
  data,
  address: "0xob",
  topic0: "0xt",
  timestamp: 1,
});

const scan = (over: Partial<ScanResult>): ScanResult => ({
  ok: true,
  logs: [],
  nextBlock: 100,
  ...over,
});

describe("toCompactLog (decode-at-scan-time)", () => {
  it("decodes the Context payload into ctx and drops the raw fields", () => {
    const compact = toCompactLog(
      rawLog("10", "0", contextData(OWNER, 81n, 5n)),
    );
    expect(compact).toEqual({
      block_number: "10",
      log_index: "0",
      transaction_hash: "0x100",
      timestamp: 1,
      ctx: {
        orderHash: `0x${ORDER_HASH_WORD.toString(16).padStart(64, "0")}`,
        index: "81",
        address: OWNER,
        amount: "5",
      },
    });
    expect(compact).not.toHaveProperty("data");
  });

  it("keeps undecodable logs with ctx=null (set stays complete for merge/dedupe)", () => {
    const compact = toCompactLog(rawLog("10", "0", "0xdeadbeef"));
    expect(compact.ctx).toBeNull();
    expect(compact.block_number).toBe("10");
  });
});

describe("migrateCacheData (legacy v1 blob -> compact v2, no rescan)", () => {
  it("decodes every legacy log and preserves watermarks + updatedAt", () => {
    const legacy: LegacyBlobCacheData = {
      logs: [
        rawLog("10", "0", contextData(OWNER, 81n, 5n)),
        rawLog("11", "0", "0xdeadbeef"),
      ],
      lowWaterBlock: 5,
      highWaterBlock: 99,
      updatedAt: 1000,
    };
    const { cache, migrated } = migrateCacheData(legacy);
    expect(migrated).toBe(true);
    expect(cache.formatVersion).toBe(CACHE_FORMAT_VERSION);
    expect(cache.lowWaterBlock).toBe(5);
    expect(cache.highWaterBlock).toBe(99);
    expect(cache.updatedAt).toBe(1000);
    expect(cache.logs).toHaveLength(2);
    expect(cache.logs[0].ctx?.address).toBe(OWNER);
    expect(cache.logs[1].ctx).toBeNull();
    expect(cache.logs[0]).not.toHaveProperty("data");
  });

  it("passes an already-compact cache through untouched", () => {
    const compact: BlobCacheData = {
      formatVersion: CACHE_FORMAT_VERSION,
      logs: [log("10", "0")],
      lowWaterBlock: 5,
      highWaterBlock: 99,
      updatedAt: 1000,
    };
    const { cache, migrated } = migrateCacheData(compact);
    expect(migrated).toBe(false);
    expect(cache).toBe(compact);
  });
});

describe("mergeLogs", () => {
  it("returns existing untouched when there is nothing to add", () => {
    const existing = [log("1", "0")];
    expect(mergeLogs(existing, [])).toBe(existing);
  });

  it("appends new logs and preserves order", () => {
    const merged = mergeLogs([log("1", "0")], [log("2", "0"), log("3", "1")]);
    expect(merged.map((l) => l.block_number)).toEqual(["1", "2", "3"]);
  });

  it("de-dupes by (block_number, log_index) so a boundary overlap can't double-insert", () => {
    const existing = [log("10", "0"), log("10", "1")];
    // A delta re-scanned from the watermark resurfaces block 10 plus a new block 11.
    const merged = mergeLogs(existing, [log("10", "0"), log("10", "1"), log("11", "0")]);
    expect(merged).toHaveLength(3);
    expect(merged.map((l) => `${l.block_number}:${l.log_index}`)).toEqual([
      "10:0",
      "10:1",
      "11:0",
    ]);
  });

  it("is idempotent when merging an identical set", () => {
    const existing = [log("1", "0"), log("2", "0")];
    expect(mergeLogs(existing, [log("1", "0"), log("2", "0")])).toHaveLength(2);
  });
});

describe("planFullScanResult (never poison the cache on a failed scan)", () => {
  const cached: BlobCacheData = {
    formatVersion: CACHE_FORMAT_VERSION,
    logs: [log("5", "0"), log("6", "0")],
    lowWaterBlock: 5,
    highWaterBlock: 99,
    updatedAt: 1000,
  };

  it("keeps the existing cache and does NOT persist when the scan failed", () => {
    const out = planFullScanResult(cached, scan({ ok: false, logs: [] }), 1, 2000);
    expect(out.persist).toBe(false);
    expect(out.cache).toBe(cached); // serve stale, never overwrite with the empty/partial set
  });

  it("returns null (no cache) and does NOT persist when a cold scan fails", () => {
    const out = planFullScanResult(null, scan({ ok: false, logs: [] }), 1, 2000);
    expect(out.persist).toBe(false);
    expect(out.cache).toBeNull();
  });

  it("rebuilds and persists when the scan completed", () => {
    const logs = [log("20", "0")];
    const out = planFullScanResult(cached, scan({ ok: true, logs, nextBlock: 50 }), 20, 2000);
    expect(out.persist).toBe(true);
    expect(out.cache).toEqual({
      formatVersion: CACHE_FORMAT_VERSION,
      logs,
      lowWaterBlock: 20,
      highWaterBlock: 50,
      updatedAt: 2000,
    });
  });

  it("persists a genuinely-empty completed scan (distinct from a failure)", () => {
    const out = planFullScanResult(null, scan({ ok: true, logs: [], nextBlock: 50 }), 10, 2000);
    expect(out.persist).toBe(true);
    expect(out.cache?.logs).toEqual([]);
    expect(out.cache?.lowWaterBlock).toBe(10);
  });
});

describe("toWireLogs (serialization filters)", () => {
  const cache: BlobCacheData = {
    formatVersion: CACHE_FORMAT_VERSION,
    logs: [
      log("5", "0"), // below requestedFrom
      log("10", "0"), // OWNER
      log("11", "0", { ctx: { index: "1", address: OTHER, amount: "9" } }),
      log("12", "0", { ctx: null }), // undecodable
    ],
    lowWaterBlock: 5,
    highWaterBlock: 99,
    updatedAt: 1000,
  };

  it("filters to [requestedFrom, tip] and ships the compact wire shape", () => {
    const wire = toWireLogs(cache, 10);
    expect(wire.map((l) => l.block_number)).toEqual(["10", "11", "12"]);
    expect(wire[0]).toEqual({
      block_number: "10",
      transaction_hash: "0x100",
      timestamp: 1,
      ctx: cache.logs[1].ctx,
    });
    expect(wire[0]).not.toHaveProperty("log_index");
  });

  it("owner filter keeps only that wallet's logs, case-insensitively", () => {
    const wire = toWireLogs(cache, 1, OWNER.toUpperCase().replace("0X", "0x"));
    expect(wire.map((l) => l.block_number)).toEqual(["5", "10"]);
    expect(wire.every((l) => l.ctx?.address === OWNER)).toBe(true);
  });

  it("owner filter drops ctx-null logs (client drops them anyway)", () => {
    const wire = toWireLogs(cache, 1, OWNER);
    expect(wire.some((l) => l.ctx === null)).toBe(false);
  });

  it("no owner keeps ctx-null logs (full-set behaviour unchanged)", () => {
    const wire = toWireLogs(cache, 1);
    expect(wire).toHaveLength(4);
  });
});
