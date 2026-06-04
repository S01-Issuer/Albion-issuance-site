/**
 * Rain DecimalFloat helpers (OrderBook v6).
 *
 * v6 amounts are "Float" values encoded as bytes32. The claims merkle leaf for a v6
 * order hashes the Float-encoded amount (not the raw 18-decimal integer used by v4),
 * and the signed context submitted to takeOrders3 carries the same Float bytes32.
 *
 * The @rainlanguage/orderbook SDK ships a WASM `Float` class that auto-initializes on
 * import, so these wrappers are synchronous (matching the sync merkle/leaf helpers).
 */
import { Float } from "@rainlanguage/orderbook";

// The WASM bindings sometimes return the value directly and sometimes wrap it in
// `{ value }` / `{ float }`; normalize to the underlying Float instance.
function unwrap(result: unknown): {
  asHex: () => string | { value: string };
  toFixedDecimalLossy: (d: number) => unknown;
} {
  const r = result as Record<string, unknown>;
  if (r && typeof r.asHex === "function") return r as never;
  if (
    r &&
    r.value &&
    typeof (r.value as Record<string, unknown>).asHex === "function"
  )
    return r.value as never;
  if (
    r &&
    r.float &&
    typeof (r.float as Record<string, unknown>).asHex === "function"
  )
    return r.float as never;
  throw new Error("Unexpected Float result shape");
}

function hexOf(v: string | { value: string }): string {
  return typeof v === "string" ? v : v.value;
}

/**
 * Encode an 18-decimal integer amount (wei) as a v6 Float bytes32 hex string.
 * `Float.fromFixedDecimalLossy(x, 18)` interprets `x` as x / 1e18, i.e. the human
 * payout value, which is exactly what the v6 USDC vault decrease is compared against.
 */
export function floatHexFromAmount18(amount18: bigint): `0x${string}` {
  const f = unwrap(Float.fromFixedDecimalLossy(amount18, 18));
  return hexOf(f.asHex()) as `0x${string}`;
}

/** The v6 Float bytes32, as a bigint (for packing into a merkle leaf word). */
export function floatWordFromAmount18(amount18: bigint): bigint {
  return BigInt(floatHexFromAmount18(amount18));
}

/** Float bytes32 for zero (takeOrders3 minimumInput). */
export function floatZeroHex(): `0x${string}` {
  const f = unwrap(
    typeof Float.zero === "function" ? Float.zero() : (Float as never)["zero"],
  );
  return hexOf(f.asHex()) as `0x${string}`;
}

/** Float bytes32 for the maximum positive value (takeOrders3 maximumInput / IO ratio). */
export function floatMaxHex(): `0x${string}` {
  const f = unwrap(
    typeof Float.maxPositiveValue === "function"
      ? Float.maxPositiveValue()
      : (Float as never)["maxPositiveValue"],
  );
  return hexOf(f.asHex()) as `0x${string}`;
}

/** Decode a v6 Float bytes32 hex back to an 18-decimal integer amount (wei). */
export function amount18FromFloatHex(hex: string): bigint {
  const f = unwrap(Float.fromHex(hex as `0x${string}`));
  const fd = f.toFixedDecimalLossy(18) as Record<string, unknown>;
  const inner = (fd.value ?? fd) as Record<string, unknown>;
  const raw = (inner.value ?? inner) as unknown;
  return BigInt(String(raw));
}

/** Encode an integer index (0 decimal places) as a v6 Float bytes32, as a bigint.
 *  Mirrors Float.fromFixedDecimalLossy(index, 0) used by claims.rain. */
export function floatWordFromIndex(index: bigint): bigint {
  const f = unwrap(Float.fromFixedDecimalLossy(index, 0));
  return BigInt(hexOf(f.asHex()));
}

/** Decode a Float bytes32 hex that was encoded with 0 decimal places back to its original integer.
 *  Used to recover the claim index from a v6 Context event log. */
export function indexFromFloatHex(hex: string): bigint {
  const f = unwrap(Float.fromHex(hex as `0x${string}`));
  const fd = f.toFixedDecimalLossy(0) as Record<string, unknown>;
  const inner = (fd.value ?? fd) as Record<string, unknown>;
  const raw = (inner.value ?? inner) as unknown;
  return BigInt(String(raw));
}
