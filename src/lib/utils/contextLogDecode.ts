import { decodeAbiParameters } from "viem";

/**
 * The claimed-detection fields carried by a Context / ContextV2 event's `data`.
 * Shared wire shape between the server scanner (which pre-decodes) and the client
 * claims pipeline (which matches these against CSV rows).
 */
export interface DecodedContext {
  index: string;
  address: string;
  amount: string;
  /** Order hash from Context calling-context col[1][0] ([orderHash, owner, counterparty]). */
  orderHash?: string;
}

function toBytes32Hex(v: unknown): string {
  return (
    "0x" +
    BigInt(v as string | bigint)
      .toString(16)
      .padStart(64, "0")
  );
}

/**
 * Decode a Context / ContextV2 event's `data` into the fields claimed-detection
 * needs. ENCODING-INDEPENDENT: both eras put the claim index/amount as the first
 * two words of the same signing column and the order hash in calling-context
 * col[1][0]; v4 (int18) and v6 (Float-as-uint256) differ only in how those raw
 * words are later interpreted (see `decodedLogMatchesClaim`), not in how they are
 * read here. Returns null for undecodable / non-claim data.
 *
 * This is the single source of truth for the decode — the server route pre-runs
 * it once per scan so the client never ships/decodes the 30MB+ raw log set, and
 * the client's receipt-fallback path (raw logs, no server pre-decode) reuses it.
 */
export function decodeContextData(data: string | undefined): DecodedContext | null {
  if (!data || data === "0x") return null;
  try {
    // viem (not ethers' AbiCoder) so the decode also runs under vitest —
    // ethers' Result proxy breaks in the vite test transform.
    const [sender, contextColumns] = decodeAbiParameters(
      [{ type: "address" }, { type: "uint256[][]" }],
      data as `0x${string}`,
    );

    const orderHash =
      contextColumns[1] && contextColumns[1].length >= 1
        ? toBytes32Hex(contextColumns[1][0])
        : undefined;

    const columnsToCheck = [6, 5, 7, 8, 0, 1, 2, 3, 4, 9];
    for (const colIdx of columnsToCheck) {
      const col = contextColumns[colIdx];
      if (col && col.length >= 2) {
        return {
          orderHash,
          index: col[0].toString(),
          address: sender,
          amount: col[1].toString(),
        };
      }
    }

    return null;
  } catch {
    // Return null instead of a fake entry - don't mask real claim data.
    return null;
  }
}
