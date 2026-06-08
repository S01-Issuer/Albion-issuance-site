/**
 * Era-aware claim execution against an OrderBook.
 *
 * v4 uses `takeOrders2` with uint256 min/max and a uint256[] signed context.
 * v6 uses `takeOrders3` + SDK TakeOrdersConfigV5 (IOIsInput=true) on the v6 OrderBook.
 */
import type { Hex } from "viem";
import { bytesToHex } from "viem";
import { hexlify } from "ethers";
import {
  getTakeOrders3Calldata,
  type TakeOrderConfigV4,
} from "@rainlanguage/orderbook";
import { Float } from "@rainlanguage/orderbook";
import { getOrderbookSource, type OrderbookVersion } from "$lib/network";
import { sumFloatHexWords } from "$lib/utils/float";
import { normalizeOrderForSdk } from "$lib/utils/orderbook";
import orderbookV4Abi from "$lib/abi/orderbook.json";
import orderbookV6Abi from "$lib/abi/orderbook-v6.json";

export interface SignedContextLike {
  signer: string;
  context: Array<string | bigint | number>;
  signature: unknown;
}

export interface OrderEntry {
  order: unknown;
  inputIOIndex: number;
  outputIOIndex: number;
  signedContext: SignedContextLike[];
}

const MAX_UINT256 = 2n ** 256n - 1n;

export function formatUint256Hex(value: string | bigint | number): string {
  if (typeof value === "string" && value.startsWith("0x")) {
    const hex = value.slice(2).padStart(64, "0").slice(-64);
    return `0x${hex}`;
  }
  const raw =
    typeof value === "string" && value.includes(".")
      ? BigInt(value)
      : BigInt(value);
  return `0x${raw.toString(16).padStart(64, "0")}`;
}

export function formatSignatureHex(signature: string | Uint8Array): string {
  if (typeof signature === "string") {
    return signature.startsWith("0x") ? signature : `0x${signature}`;
  }
  return hexlify(signature);
}

export function stringifyOrderContexts(
  orders: OrderEntry[],
): TakeOrderConfigV4[] {
  return orders.map((order) => ({
    order: normalizeOrderForSdk(order.order as TakeOrderConfigV4["order"]),
    inputIOIndex: String(order.inputIOIndex),
    outputIOIndex: String(order.outputIOIndex),
    signedContext: order.signedContext.map((ctx) => ({
      signer: ctx.signer,
      context: ctx.context.map((v) => formatUint256Hex(v)),
      signature: formatSignatureHex(
        ctx.signature as string | Uint8Array,
      ),
    })),
  }));
}

/** Use the claim amount Float word from signed context (max Float reverts on-chain). */
function maximumIoHexFromSignedContext(
  signedContext: TakeOrderConfigV4["signedContext"],
): string {
  const amountSlot = signedContext[0]?.context[1];
  if (typeof amountSlot === "string" && amountSlot.startsWith("0x")) {
    return amountSlot.length === 66
      ? amountSlot
      : formatUint256Hex(amountSlot);
  }
  if (amountSlot !== undefined) {
    return formatUint256Hex(amountSlot);
  }
  throw new Error("Failed to read claim amount from signed context.");
}

/** Total claim amount across a batch (maximumIO must cover every signed context). */
function maximumIoHexFromOrders(orders: TakeOrderConfigV4[]): string {
  const amountHexes: string[] = [];
  for (const order of orders) {
    for (const ctx of order.signedContext) {
      const slot = ctx?.context[1];
      if (slot === undefined) continue;
      amountHexes.push(
        typeof slot === "string" && slot.startsWith("0x") && slot.length === 66
          ? slot
          : formatUint256Hex(slot),
      );
    }
  }
  if (amountHexes.length === 0) {
    return maximumIoHexFromSignedContext(orders[0].signedContext);
  }
  return sumFloatHexWords(amountHexes);
}

function buildClaimTakeOrdersConfig(orders: TakeOrderConfigV4[]) {
  const ratioOne = Float.parse("1");
  if (ratioOne.error || !ratioOne.value) {
    throw new Error("Failed to build claim parameters.");
  }
  if (orders.length === 0) {
    throw new Error("No orders to claim.");
  }
  return {
    minimumIO: Float.fromBigint(0n).asHex(),
    maximumIO: maximumIoHexFromOrders(orders),
    maximumIORatio: ratioOne.value.asHex(),
    IOIsInput: true as unknown as string,
    orders,
    data: "0x",
  };
}

function takeOrdersCalldataToHex(value: string | Uint8Array): Hex {
  if (typeof value === "string") {
    return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
  }
  return bytesToHex(value);
}

export function versionForOrderbook(orderbookAddress: string): OrderbookVersion {
  return getOrderbookSource(orderbookAddress)?.version ?? "v4";
}

export function usesV6SdkClaimCalldata(orderbookAddress: string): boolean {
  return versionForOrderbook(orderbookAddress) === "v6";
}

export function abiForVersion(version: OrderbookVersion) {
  return version === "v6" ? orderbookV6Abi : orderbookV4Abi;
}

export function takeOrdersFnForVersion(version: OrderbookVersion): string {
  return version === "v6" ? "takeOrders3" : "takeOrders2";
}

/**
 * Build the TakeOrdersConfig (V3 for v4) for `takeOrders2` via viem.
 */
export function buildTakeOrdersConfig(
  orders: OrderEntry[],
  version: OrderbookVersion,
) {
  if (version === "v6") {
    throw new Error("v6 claims must use buildV6ClaimCalldata");
  }
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

/** Count signed contexts across all holdings (for diagnostics). */
export function countClaimSignedContexts(orders: OrderEntry[]): number {
  return orders.reduce((n, o) => n + o.signedContext.length, 0);
}

/**
 * Build v6 claim calldata (TakeOrdersConfigV5 / takeOrders4 selector).
 *
 * Batch shape: one TakeOrderConfigV4 row per payout index (same Rain order
 * repeated), maximumIO = sum of all claim Float amounts.
 */
export function buildV6ClaimCalldata(orders: OrderEntry[]): Hex {
  const stringified = stringifyOrderContexts(orders);
  const res = getTakeOrders3Calldata(
    buildClaimTakeOrdersConfig(stringified) as never,
  ) as {
    value?: string | Uint8Array;
    error?: { readableMsg?: string };
  };
  if (res.error) {
    throw new Error(
      `getTakeOrders3Calldata: ${res.error.readableMsg ?? JSON.stringify(res.error)}`,
    );
  }
  if (!res.value) {
    throw new Error("getTakeOrders3Calldata returned no calldata");
  }
  return takeOrdersCalldataToHex(res.value);
}
