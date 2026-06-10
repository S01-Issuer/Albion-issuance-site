import { describe, it, expect } from "vitest";
import {
  mergeLogs,
  planFullScanResult,
  type BlobCacheData,
  type CachedLog,
  type ScanResult,
} from "./cache";

const log = (block: string, index: string): CachedLog => ({
  block_number: block,
  log_index: index,
  transaction_index: "0",
  transaction_hash: `0x${block}${index}`,
  data: "0x",
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
