/**
 * Era-aware claim execution against an OrderBook.
 *
 * v4 uses `takeOrders2` with uint256 min/max and a uint256[] signed context.
 * v6 (Raindex/Float) uses `takeOrders3` with Float (bytes32) min/max and a
 * bytes32[] signed context. Holdings carry their `orderBookAddress`, so callers
 * group by OrderBook and build the right config per era.
 */
import type { Hex } from "viem";
import { getTakeOrders3Calldata } from "@rainlanguage/orderbook";
import { getOrderbookSource, type OrderbookVersion } from "$lib/network";
import { floatZeroHex, floatMaxHex } from "$lib/utils/float";
import orderbookV4Abi from "$lib/abi/orderbook.json";
import orderbookV6Abi from "$lib/abi/orderbook-v6.json";

export interface SignedContextLike {
  signer: string;
  context: Array<string | bigint | number>;
  signature: unknown;
}

export interface OrderEntry {
  order: unknown; // decoded OrderV3 (v4) / OrderV4 (v6), array/tuple form
  inputIOIndex: number;
  outputIOIndex: number;
  signedContext: SignedContextLike[];
}

const MAX_UINT256 = 2n ** 256n - 1n;

function toBytes32(v: string | bigint | number): Hex {
  const b =
    typeof v === "string" && v.startsWith("0x") ? BigInt(v) : BigInt(v);
  return ("0x" + b.toString(16).padStart(64, "0")) as Hex;
}

/** Deep-convert an ethers Result (array-like) into plain nested arrays for viem. */
function toPlain(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(toPlain);
  return v;
}

export function versionForOrderbook(orderbookAddress: string): OrderbookVersion {
  return getOrderbookSource(orderbookAddress)?.version ?? "v4";
}

export function abiForVersion(version: OrderbookVersion) {
  return version === "v6" ? orderbookV6Abi : orderbookV4Abi;
}

export function takeOrdersFnForVersion(version: OrderbookVersion): string {
  return version === "v6" ? "takeOrders3" : "takeOrders2";
}

/**
 * Build the TakeOrdersConfig (V3 for v4, V4 for v6) for `takeOrders*`.
 */
export function buildTakeOrdersConfig(
  orders: OrderEntry[],
  version: OrderbookVersion,
) {
  if (version === "v6") {
    const max = floatMaxHex();
    return {
      minimumInput: floatZeroHex(),
      maximumInput: max,
      maximumIORatio: max,
      orders: orders.map((o) => ({
        order: toPlain(o.order),
        inputIOIndex: BigInt(o.inputIOIndex),
        outputIOIndex: BigInt(o.outputIOIndex),
        signedContext: o.signedContext.map((sc) => ({
          signer: sc.signer,
          context: sc.context.map(toBytes32),
          signature: sc.signature,
        })),
      })),
      data: "0x" as Hex,
    };
  }
  // v4
  return {
    minimumInput: 0n,
    maximumInput: MAX_UINT256,
    maximumIORatio: MAX_UINT256,
    orders: orders.map((o) => ({
      order: o.order,
      inputIOIndex: o.inputIOIndex,
      outputIOIndex: o.outputIOIndex,
      signedContext: o.signedContext,
    })),
    data: "0x" as Hex,
  };
}

// ---------------------------------------------------------------------------
// v6 (new Raindex OrderBook 0xb05D…) claim calldata.
//
// The new OrderBook takes `TakeOrdersConfigV5` (adds `IOIsInput`), which the
// ethers/ABI path can't express, so we build the calldata with the SDK's
// getTakeOrders3Calldata. IOIsInput MUST be true: the claim order's IO ratio is
// 0 (free output), and IOIsInput=false makes the OB divide by that 0 ratio and
// revert with DivisionByZero. Anvil-verified end-to-end against 0xb05D… (2026-06).
// ---------------------------------------------------------------------------

function bytesToHex(sig: unknown): string {
  if (typeof sig === "string") return sig.startsWith("0x") ? sig : "0x" + sig;
  const bytes = sig as Uint8Array;
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Map a decoded OrderV4 (ethers Result / tuple) to the SDK's plain OrderV4 object. */
function toOrderV4Object(order: any) {
  const io = (x: any) => ({
    token: x.token as string,
    vaultId: (typeof x.vaultId === "string"
      ? x.vaultId
      : toBytes32(x.vaultId)) as string,
  });
  return {
    owner: order.owner as string,
    evaluable: {
      interpreter: order.evaluable.interpreter as string,
      store: order.evaluable.store as string,
      bytecode: order.evaluable.bytecode as string,
    },
    validInputs: Array.from(order.validInputs).map(io),
    validOutputs: Array.from(order.validOutputs).map(io),
    nonce: order.nonce as string,
  };
}

/**
 * Build the raw `takeOrders3` calldata for one or more v6 claim orders, ready to
 * submit via `sendTransaction({ to: orderbookAddress, data })`.
 */
export function buildV6ClaimCalldata(orders: OrderEntry[]): Hex {
  const max = floatMaxHex();
  const config = {
    minimumIO: floatZeroHex(),
    maximumIO: max,
    maximumIORatio: max,
    IOIsInput: true as unknown as string,
    orders: orders.map((o) => ({
      order: toOrderV4Object(o.order),
      inputIOIndex: String(o.inputIOIndex),
      outputIOIndex: String(o.outputIOIndex),
      signedContext: o.signedContext.map((sc) => ({
        signer: sc.signer,
        context: sc.context.map((c) => toBytes32(c)),
        signature: bytesToHex(sc.signature),
      })),
    })),
    data: "0x",
  };

  const res = getTakeOrders3Calldata(config as never) as {
    value?: string;
    error?: { readableMsg?: string };
  };
  if (res.error) {
    throw new Error(
      `getTakeOrders3Calldata: ${res.error.readableMsg ?? JSON.stringify(res.error)}`,
    );
  }
  return res.value as Hex;
}
