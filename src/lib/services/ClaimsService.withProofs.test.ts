import { describe, it, expect } from "vitest";
import { ClaimsService } from "./ClaimsService";
import {
  ORDERBOOK_V6_CONTRACT_ADDRESS,
  type Claim,
} from "$lib/network";
import type { OrderDetail } from "$lib/data/repositories/claimsRepository";
import type { CsvClaimRow } from "$lib/utils/claims";

/**
 * Focused test for the `withProofs` gate on `processClaimForWallet`.
 *
 * The CSV fetch is bypassed by priming the service's private `csvCache`, and the
 * Context-log scan is bypassed by passing an empty per-OB logs map (no network).
 * The order is supplied directly via `ordersByHash` using a real v6 orderBytes
 * fixture, keyed to the v6 OrderBook (claimable era).
 *
 * What this proves about the gate:
 *   - withProofs:false -> the display path returns successfully WITHOUT touching
 *     any proof machinery (no merkle tree, no decodeOrder, no signedContext). The
 *     returned holdings carry `signedContext === undefined` / `order === undefined`.
 *   - withProofs:true  -> the proof path is entered and reaches `decodeOrder`.
 *
 * NOTE on the withProofs:true path: under vitest, `ethers` is aliased to a shim
 * (src/e2e/shims/ethers.ts) whose `AbiCoder.decode()` returns [], so the real
 * order/proof construction cannot run in this environment. We therefore assert
 * that the proof branch is REACHED (decodeOrder is invoked) — which the false
 * path provably never does. Full proof-field construction is covered end-to-end
 * by the e2e suite (src/e2e/claims.e2e.spec.ts), which Task 9 updates.
 */

const WALLET = "0x1111111111111111111111111111111111111111";

// Real v6 (Float) order fixture lifted from src/lib/network.ts (ALB-WR1-R1 R1).
const ORDER_HASH =
  "0x15fba827674bf560223757b0b4a498d5f0c7f4c094aacfce56f2a36a8446b72b";
const ORDER_BYTES =
  "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a51fd23d6e2442805130eac0712f590691e9151700000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000034000000000000000000000000000000000000000000000000000000000000003a00c6f6d6f38fa9b60eca795e2d4be12e01e3b250fce32ab12912cf2098e672c730000000000000000000000003bf9bd9da4784f75c92317e61c68493ecc9aabdc0000000000000000000000001aa775533e28b1d843e1a589034984e3a62005dc0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000021f000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000457870656374656420636c61696dee000000000000000000000000000000000000000000000000636c61696d6564e70000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000436c61696d6564e79db977f553e0bb3e272d5781792ca503a3b2c03d4396c74d1ee853b74ac91fc8000000000000000000000000000000000000000000000000000050726f6f66e500000000000000000000000022d83c031bc02737ad3eaf5aa3386de2bf7f7fbc00000000000000000000000000000000000000000000000000000000000000df0500000024005c0070009808040004031001060b100002001000010b010003001000010b01000400100000011000000d060002031001060b1000020110000100100000031004041f1200001e020000011000030110000200100001031000010c13000047020000040300010310010603100201031000060c1300000906010101100004011000000110000200100000031000010c130000461100001f1200001e0200000e0b010203100906031008060310070603100606031005060310040603100306031002060010000001100005021a000701100006001000011e02000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000042000000000000000000000000000000000000060bcaa157c90b6dd177b726617436d280f497823449656f224494a99d7d33e9610000000000000000000000000000000000000000000000000000000000000001000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130bcaa157c90b6dd177b726617436d280f497823449656f224494a99d7d33e961";

const CSV_LINK = "https://example.test/claims.csv";

const CLAIM: Claim = {
  csvLink: CSV_LINK,
  orderHash: ORDER_HASH,
  // Zero sentinel -> assertMerkleRootMatches is skipped (we assert field
  // presence, not root values, which are meaningless under the keccak shim).
  expectedMerkleRoot:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  expectedContentHash: "bafkreitestcontenthash",
} as Claim;

// One unclaimed row for our wallet -> becomes a claimable holding.
const CSV_ROW: CsvClaimRow = {
  index: "0",
  address: WALLET,
  amount: "1000000000000000000", // 1.0 (18-dec)
} as CsvClaimRow;

const ORDER_DETAIL: OrderDetail = {
  orderBytes: ORDER_BYTES,
  orderHash: ORDER_HASH,
  orderbook: { id: ORDERBOOK_V6_CONTRACT_ADDRESS.toLowerCase() },
  addEvents: [
    {
      transaction: {
        id: "",
        timestamp: "",
        blockNumber: "47065011",
      },
    },
  ],
};

/** Invoke the private processClaimForWallet with hand-built, network-free inputs. */
async function runProcess(withProofs: boolean) {
  const service = new ClaimsService();

  // Prime the private CSV cache so no fetch happens (keyed by csvLink).
  (
    service as unknown as { csvCache: Map<string, CsvClaimRow[]> }
  ).csvCache.set(CSV_LINK, [CSV_ROW]);

  const ordersByHash = new Map<string, OrderDetail>([
    [ORDER_HASH.toLowerCase(), ORDER_DETAIL],
  ]);
  // Empty per-OB logs map -> sortClaimsData uses the (empty) prefetched logs,
  // so nothing is marked claimed and no network scan runs.
  const logsByOb = new Map<string, []>();

  return (
    service as unknown as {
      processClaimForWallet: (
        claim: Claim,
        ownerAddress: string,
        fieldName: string,
        tokenAddress: string,
        symbol: string,
        ordersByHash: Map<string, OrderDetail>,
        logsByOb: Map<string, []>,
        claimTxHashes: string[],
        withProofs: boolean,
      ) => Promise<{
        holdings: Array<{ signedContext?: unknown; order?: unknown }>;
      } | null>;
    }
  ).processClaimForWallet(
    CLAIM,
    WALLET,
    "Wressle-1",
    "0xf836a500910453a397084ade41321ee20a5aade1",
    "ALB-WR1-R1",
    ordersByHash,
    logsByOb,
    [],
    withProofs,
  );
}

describe("ClaimsService withProofs gate", () => {
  it("withProofs:false yields display-only holdings (signedContext undefined)", async () => {
    const result = await runProcess(false);
    if (!result) throw new Error("expected a non-null result");
    expect(result.holdings.length).toBeGreaterThan(0);
    for (const h of result.holdings) {
      expect(h.signedContext).toBeUndefined();
      expect(h.order).toBeUndefined();
    }
  });

  it("withProofs:true enters the proof path (reaches decodeOrder)", async () => {
    // The display (withProofs:false) path never decodes the order, so it returns
    // cleanly above. The proof path DOES decode the order; under the vitest
    // `ethers` shim that decode yields an empty tuple and throws when normalized.
    // Reaching that throw proves the proof branch is gated on withProofs:true.
    await expect(runProcess(true)).rejects.toThrow(/owner/);
  });
});
