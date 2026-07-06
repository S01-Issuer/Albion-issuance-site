import { describe, it, expect } from "vitest";
import { sortClaimsData, type HypersyncResult } from "./claims";
import { decodeContextData } from "./contextLogDecode";
import type { OrderbookSource } from "$lib/network";

/**
 * Server-pre-decoded `ctx` path equivalence.
 *
 * /api/context-events now decodes each Context log server-side and ships a
 * compact `ctx` (order hash + index + amount + sender) INSTEAD of the ~2KB raw
 * `data` blob, so the browser skips ~16.5k viem decodes per load. This test
 * pins the invariant that the fast path (log carries `ctx`, no `data`) yields
 * byte-identical claimed-detection to the raw-`data` fallback path — using the
 * same real on-chain ContextV2 fixture as claims.v6ClaimedScope.test.ts.
 */

const V6_CONTEXT_LOG_DATA =
  "0x0000000000000000000000008f6bf4a948af2fc74ee34982c4435a7c013d1a520000000000000000000000000000000000" +
  "0000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000007000000" +
  "00000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000" +
  "000000000000000000014000000000000000000000000000000000000000000000000000000000000001c000000000000000" +
  "0000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000" +
  "000000000002e000000000000000000000000000000000000000000000000000000000000003a00000000000000000000000" +
  "0000000000000000000000000000000000000003e00000000000000000000000000000000000000000000000000000000000" +
  "0000020000000000000000000000008f6bf4a948af2fc74ee34982c4435a7c013d1a52000000000000000000000000b05d73" +
  "e6bcc26aeb5b67ff68c6e9c6151073e3ce0000000000000000000000000000000000000000000000000000000000000003f1" +
  "c6dbb3d1558926f5059610e991216cdac21b26b23102f2e789b8846cdf0bba000000000000000000000000a51fd23d6e2442" +
  "805130eac0712f590691e915170000000000000000000000008f6bf4a948af2fc74ee34982c4435a7c013d1a520000000000" +
  "000000000000000000000000000000000000000000000000000002ffffffee00000000000000000000000000000000000000" +
  "000e34820b371020000000000000000000000000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000005000000000000000000000000420000000000000000000000000000" +
  "00000000060000000000000000000000000000000000000000000000000000000000000012494e4caa87612a61533c4d6b69" +
  "2fa9087cb25c27f66945b4d6ad1ccbf198f48d00000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" +
  "000000000000000000000000000005000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000" +
  "0000000000000000000000000000000000000000000000000000000006494e4caa87612a61533c4d6b692fa9087cb25c27f6" +
  "6945b4d6ad1ccbf198f48dfffffffa0000000000000000000000000000000000000000000000001dd7d7b0ffffffee000000" +
  "00000000000000000000000000000000000e34820b3710200000000000000000000000000000000000000000000000000000" +
  "00000000000001000000000000000000000000fc2d93b0feebb855ca415320a29fa21d9aa729aa0000000000000000000000" +
  "00000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000" +
  "000051ffffffee00000000000000000000000000000000000000000e34820b37102000423843abdf374f8eef3b35bbd235bf" +
  "da7b0e528bb1c0245103687bc6780eb01181433d8194ac4cb97140d0e4db0cc6434e48be2670b62923ddc71668aeaba06892" +
  "89c882e07f623b189c04691ffe9d309a9f517427fe3463301bca04c2d07ca241aaeecad40d4e2648c55e9256715fda46d18c" +
  "42db408afcc2093b34b19f8ccd2446cfab7d1d8691c82ebde68bbead140ae7279acafb72d603770d6bb9e9a6a6de8dc572a0" +
  "80111890d5662de26631b8933e4e9e41b297401a13e28b2d4571479153772228b751421ad38c72239e078f6195a7a16f8f01" +
  "4a97cc0e96f55c2f9666719a72aed8a7dc254b08b3654e4cdcf42b3d7fd57647cf68dcd3b57e150bed";

const OWNER = "0x8f6bF4A948Af2Fc74eE34982C4435a7C013D1A52";
const ORDER_HASH =
  "0xf1c6dbb3d1558926f5059610e991216cdac21b26b23102f2e789b8846cdf0bba";

const V6_SOURCE: OrderbookSource = {
  address: "0xb05D73E6BCc26AEB5b67Ff68C6E9C6151073e3cE",
  version: "v6",
  subgraphUrls: [],
  contextEventTopic:
    "0x4cb6e22a3e7e651d7cf0376cff48f20f5007a54147777865be7f5f6c38c50f4a",
  amountEncoding: "float",
  claimable: true,
};

const CSV_ROWS = [
  { index: "81", address: OWNER.toLowerCase(), amount: "1023586000000000000" },
  { index: "82", address: OWNER.toLowerCase(), amount: "55000000000000000" },
];

// The server ships this compact shape (no raw `data`). Sender/index/amount/
// orderHash come from decoding the real log server-side — same fn the route uses.
function serverPreDecodedLog(): HypersyncResult {
  return {
    block_number: "47078524",
    transaction_hash:
      "0x0bb856c870f60d95e3d753b1c9b52025c475b886bc44e93483d08677c3b06af1",
    timestamp: 1765000000,
    ctx: decodeContextData(V6_CONTEXT_LOG_DATA),
  };
}

async function runSort(log: HypersyncResult) {
  return sortClaimsData(
    CSV_ROWS,
    [],
    OWNER,
    "Wressle-1",
    undefined,
    "0xf836a500910453A397084ADe41321ee20a5AAde1",
    ORDER_HASH,
    "ALB-WR1-R1",
    47065011,
    [log],
    V6_SOURCE,
    [],
  );
}

describe("server-pre-decoded ctx path", () => {
  it("decodeContextData extracts the order hash from calling-context col[1][0]", () => {
    const ctx = decodeContextData(V6_CONTEXT_LOG_DATA);
    expect(ctx?.orderHash).toBe(ORDER_HASH);
    expect(ctx?.address.toLowerCase()).toBe(OWNER.toLowerCase());
  });

  it("returns null for empty / undecodable data (dropped, not faked)", () => {
    expect(decodeContextData("0x")).toBeNull();
    expect(decodeContextData(undefined)).toBeNull();
    expect(decodeContextData("0xdeadbeef")).toBeNull();
  });

  it("a log carrying ctx (no raw data) detects the claim identically to the raw path", async () => {
    const result = await runSort(serverPreDecodedLog());

    expect(result.claimedCount).toBe(1);
    expect(result.claimedCsv[0]?.index).toBe("81");
    expect(result.unclaimedCount).toBe(1);
    expect(result.unclaimedCsv[0]?.index).toBe("82");
    expect(result.totalClaimedAmount).toBe("1023586000000000000");
    expect(result.claims[0]?.txHash).toBe(
      "0x0bb856c870f60d95e3d753b1c9b52025c475b886bc44e93483d08677c3b06af1",
    );
  });

  it("ctx === null (server decode miss) drops the log, leaving all rows unclaimed", async () => {
    const log = serverPreDecodedLog();
    log.ctx = null;
    const result = await runSort(log);
    expect(result.claimedCount).toBe(0);
    expect(result.unclaimedCount).toBe(2);
  });
});
