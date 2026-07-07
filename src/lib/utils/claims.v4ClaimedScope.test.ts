import { describe, it, expect } from "vitest";
import { sortClaimsData, type HypersyncResult } from "./claims";
import type { OrderbookSource } from "$lib/network";

/**
 * v4 (int18) claimed-detection scoping — regression test.
 *
 * The v6 order-hash scoping fix (col[1][0] is the ORDER HASH) was originally
 * gated on `encoding === "float"`, leaving v4 matching on (index, amount) only.
 * Holder lists are stable month-to-month, so the SAME wallet is often the SAME
 * row index with an identical wei amount across several v4 monthly orders. Without
 * order-hash scoping, one month's Context log marks that row claimed in EVERY v4
 * order sharing that (index, amount) — inflating earned/claimed and attaching the
 * wrong month's txHash to history.
 *
 * These tests use the server-pre-decoded `ctx` path (a log carrying `ctx`, no raw
 * `data`) so no v4 ABI fixture is needed — the decode is era-independent and the
 * scoping under test happens after decode.
 */

const OWNER = "0x8f6bF4A948Af2Fc74eE34982C4435a7C013D1A52";
const ORDER_A =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001";
const ORDER_B =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002";
const TOKEN = "0xf836a500910453A397084ADe41321ee20a5AAde1";

const V4_SOURCE: OrderbookSource = {
  address: "0xd2938E7c9fe3597F78832CE780Feb61945c377d7",
  version: "v4",
  subgraphUrls: [],
  contextEventTopic:
    "0x17a5c0f3785132a57703932032f6863e7920434150aa1dc940e567b440fdce1f",
  amountEncoding: "int18",
  claimable: false,
};

// Same wallet, same row index, same wei amount — the collision that recurs
// month-to-month on stable holder lists.
const INDEX = "7";
const AMOUNT_WEI = "1023586000000000000";
const CSV_ROWS = [{ index: INDEX, address: OWNER.toLowerCase(), amount: AMOUNT_WEI }];

// A v4 Context log that already carries its decoded ctx (server fast path). Its
// calling-context order hash is `logOrderHash`.
function preDecodedV4Log(logOrderHash: string): HypersyncResult {
  return {
    block_number: "35800000",
    transaction_hash:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    timestamp: 1720000000,
    ctx: {
      orderHash: logOrderHash,
      index: INDEX,
      address: OWNER,
      amount: AMOUNT_WEI,
    },
  };
}

async function runSortForOrder(
  orderHash: string,
  log: HypersyncResult,
) {
  return sortClaimsData(
    CSV_ROWS,
    [],
    OWNER,
    "Wressle-1",
    undefined,
    TOKEN,
    orderHash,
    "ALB-WR1-R1",
    35704190,
    [log],
    V4_SOURCE,
    [],
  );
}

describe("v4 claimed-detection is scoped by order hash", () => {
  it("does NOT mark order B's row claimed from order A's Context log", async () => {
    const result = await runSortForOrder(ORDER_B, preDecodedV4Log(ORDER_A));
    expect(result.claimedCount).toBe(0);
    expect(result.unclaimedCount).toBe(1);
    expect(result.totalClaimedAmount).toBe("0");
  });

  it("DOES mark the row claimed from its own order's Context log (positive control)", async () => {
    const result = await runSortForOrder(ORDER_B, preDecodedV4Log(ORDER_B));
    expect(result.claimedCount).toBe(1);
    expect(result.unclaimedCount).toBe(0);
    expect(result.totalClaimedAmount).toBe(AMOUNT_WEI);
    expect(result.claims[0]?.txHash).toBe(
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    );
  });
});
