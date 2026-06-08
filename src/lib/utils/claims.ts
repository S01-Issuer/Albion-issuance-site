import {
  ORDERBOOK_CONTRACT_ADDRESS,
  type OrderbookSource,
} from "$lib/network";
import {
  amount18FromFloatHex,
  floatWordFromAmount18,
} from "$lib/utils/float";
import type { Trade } from "$lib/types/graphql";

/** Amount encoding for an OrderBook era: v4 = raw 18-dec integers, v6 = Float bytes32. */
export type AmountEncoding = "int18" | "float";
import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";
import { AbiCoder } from "ethers";
import axios from "axios";
import { ethers } from "ethers";
import { Wallet, keccak256, hashMessage, getBytes, concat } from "ethers";
import { formatEther, parseEther } from "viem";

// Create a singleton AbiCoder instance for reuse
// This works in both production and test environments
const abiCoder = AbiCoder.defaultAbiCoder();

export const HYPERSYNC_URL = "https://8453.hypersync.xyz/query";
export const CONTEXT_EVENT_TOPIC =
  "0x17a5c0f3785132a57703932032f6863e7920434150aa1dc940e567b440fdce1f";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const IO = "(address token, uint8 decimals, uint256 vaultId)";
const EvaluableV3 = "(address interpreter, address store, bytes bytecode)";
const OrderV3 = `(address owner, ${EvaluableV3} evaluable, ${IO}[] validInputs, ${IO}[] validOutputs, bytes32 nonce)`;
// v6 OrderV4: IO drops the `decimals` field and vaultId becomes bytes32.
const IOV2 = "(address token, bytes32 vaultId)";
const OrderV4 = `(address owner, ${EvaluableV3} evaluable, ${IOV2}[] validInputs, ${IOV2}[] validOutputs, bytes32 nonce)`;

type OrderV3Type = [
  string,
  [string, string, string],
  [string, number, string][],
  [string, number, string][],
  string,
];
type SignedContextV1Type = {
  signer: string;
  context: (string | number | bigint)[];
  signature: string;
};

interface DecodedClaimLog {
  index: string;
  address: string;
  amount: string;
  /** Order hash the Context event belongs to (col[1][0]) — used to scope claims per order. */
  orderHash?: string;
  timestamp?: string;
}

interface CsvClaimRow extends Record<string, unknown> {
  index: string;
  address: string;
  amount: string;
  claimed?: boolean;
  decodedLog?: DecodedClaimLog | null;
}

type ClaimedCsvRow = CsvClaimRow & {
  claimed: true;
  decodedLog: DecodedClaimLog | null;
};

type UnclaimedCsvRow = CsvClaimRow & {
  claimed: false;
  decodedLog?: undefined;
};

interface HypersyncBlock {
  number: string;
  timestamp: string;
}

interface HypersyncLog {
  block_number: string;
  log_index: string;
  transaction_index: string;
  transaction_hash: string;
  data: string;
  address: string;
  topic0: string;
  block?: {
    timestamp: number | string;
  };
}

interface HypersyncEntry {
  blocks: HypersyncBlock[];
  logs: HypersyncLog[];
}

export interface HypersyncResponseData {
  data: HypersyncEntry[];
  next_block: number;
}

export type HypersyncResult = HypersyncLog & {
  timestamp: number | null;
};

function formatAmountWei(value: string | bigint): string {
  try {
    const bigintValue = typeof value === "bigint" ? value : BigInt(value);
    return formatEther(bigintValue);
  } catch {
    return "0";
  }
}

export interface SortedClaimsResult {
  claimedCsv: ClaimedCsvRow[];
  unclaimedCsv: UnclaimedCsvRow[];
  claims: ClaimHistory[];
  holdings: ClaimSignedContext[];
  totalClaims: number;
  claimedCount: number;
  unclaimedCount: number;
  totalClaimedAmount: string;
  totalUnclaimedAmount: string;
  totalEarned: string;
  ownerAddress: string;
}

export type ClaimHistory = {
  date: string;
  amount: string;
  asset: string;
  txHash: string;
  status: string;
  fieldName?: string;
  tokenAddress?: string;
  symbol?: string;
  orderHash?: string; // Used to look up payout date from metadata
};

export type ClaimSignedContext = {
  id: string;
  name: string;
  location: string;
  unclaimedAmount: string;
  totalEarned: string;
  lastPayout: string;
  lastClaimDate: string;
  status: string;
  order?: OrderV3Type;
  signedContext?: SignedContextV1Type;
  orderBookAddress?: string;
};

// Security validation types
export type CSVValidationResult = {
  isValid: boolean;
  error?: string;
  merkleRoot?: string;
  expectedMerkleRoot?: string;
};

export type IPFSValidationResult = {
  isValid: boolean;
  error?: string;
  contentHash?: string;
  expectedHash?: string;
};

const IPFS_FETCH_RETRIES = 2;
const IPFS_FETCH_TIMEOUT_MS = 15_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= IPFS_FETCH_RETRIES + 1; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IPFS_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      lastError = error;
      clearTimeout(timeout);
      if (attempt <= IPFS_FETCH_RETRIES) {
        await delay(200 * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError ?? new Error("Failed to fetch IPFS content");
}

/**
 * Validates CSV data integrity against on-chain merkle root
 * @param csvData - Raw CSV data to validate
 * @param expectedMerkleRoot - Expected merkle root from on-chain data
 * @param encoding - Amount encoding for the order's era. The merkle root is era-
 *   specific: v4 orders hash raw 18-dec amounts ("int18"), v6 orders hash the
 *   Float-encoded amount ("float"). `expectedMerkleRoot` therefore equals the
 *   order's actual on-chain root only when computed with the matching encoding.
 * @returns Validation result with details
 */
export function validateCSVIntegrity(
  csvData: CsvClaimRow[],
  expectedMerkleRoot: string,
  encoding: AmountEncoding = "int18",
): CSVValidationResult {
  try {
    // Validate CSV structure
    if (!Array.isArray(csvData) || csvData.length === 0) {
      return {
        isValid: false,
        error: "Invalid CSV structure: data must be a non-empty array",
      };
    }

    // Validate required fields in each row
    for (const [index, row] of csvData.entries()) {
      if (!row.address || !row.amount || row.index === undefined) {
        return {
          isValid: false,
          error: `Invalid CSV row ${index}: missing required fields (address, amount, index)`,
        };
      }

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(row.address)) {
        return {
          isValid: false,
          error: `Invalid address format in row ${index}: ${row.address}`,
        };
      }

      // Validate amount is positive
      const amount = Number.parseFloat(row.amount);
      if (isNaN(amount) || amount < 0) {
        return {
          isValid: false,
          error: `Invalid amount in row ${index}: ${row.amount}`,
        };
      }
    }

    // Generate merkle tree from CSV data (era-specific amount encoding)
    const tree = getMerkleTree(csvData, encoding);
    const calculatedMerkleRoot = tree.root;

    // Compare with expected merkle root
    if (
      calculatedMerkleRoot.toLowerCase() !== expectedMerkleRoot.toLowerCase()
    ) {
      return {
        isValid: false,
        error: "Merkle root mismatch",
        merkleRoot: calculatedMerkleRoot,
        expectedMerkleRoot,
      };
    }

    return {
      isValid: true,
      merkleRoot: calculatedMerkleRoot,
      expectedMerkleRoot,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `CSV validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Validates IPFS content integrity using content addressing
 * @param ipfsUrl - IPFS URL to validate
 * @param expectedContentHash - Expected content hash (CID)
 * @returns Validation result with details
 */
export async function validateIPFSContent(
  ipfsUrl: string,
  expectedContentHash: string,
): Promise<IPFSValidationResult> {
  try {
    // Extract CID from IPFS URL
    const urlParts = ipfsUrl.split("/");
    const cidFromUrl = urlParts[urlParts.length - 1];

    // Validate CID format
    if (!cidFromUrl || cidFromUrl.length < 10) {
      return {
        isValid: false,
        error: "Invalid IPFS URL format",
      };
    }

    // Compare with expected hash
    if (cidFromUrl !== expectedContentHash) {
      return {
        isValid: false,
        error: "IPFS content hash mismatch",
        contentHash: cidFromUrl,
        expectedHash: expectedContentHash,
      };
    }

    return {
      isValid: true,
      contentHash: cidFromUrl,
      expectedHash: expectedContentHash,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `IPFS validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Enhanced CSV fetching with security validation
 * @param csvLink - IPFS link to CSV file
 * @param expectedMerkleRoot - Expected merkle root for validation
 * @param expectedContentHash - Expected IPFS content hash
 * @param encoding - Amount encoding for the order's era (int18 v4 / float v6)
 * @returns Validated CSV data or null if validation fails
 */
export async function fetchAndValidateCSV(
  csvLink: string,
  expectedMerkleRoot: string,
  expectedContentHash: string,
  encoding: AmountEncoding = "int18",
): Promise<CsvClaimRow[] | null> {
  try {
    // Step 1: Validate IPFS content integrity
    const ipfsValidation = await validateIPFSContent(
      csvLink,
      expectedContentHash,
    );
    if (!ipfsValidation.isValid) {
      return null;
    }

    // Step 2: Fetch CSV data (server route provides gateway fallback)
    const response = await fetchWithRetry(csvLink);
    if (!response.ok) {
      return null;
    }

    const csvText = await response.text();
    const csvData = parseCSVData(csvText);

    // Step 3: Validate CSV data integrity
    const csvValidation = validateCSVIntegrity(
      csvData,
      expectedMerkleRoot,
      encoding,
    );
    if (!csvValidation.isValid) {
      if (
        expectedMerkleRoot ===
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        return csvData;
      }
      return null;
    }

    return csvData;
  } catch {
    return null;
  }
}

/**
 * Parse CSV text into structured data
 * @param csvText - Raw CSV text
 * @returns Parsed CSV data
 */
function parseCSVData(csvText: string): CsvClaimRow[] {
  const lines = csvText.split("\n");
  const headers = lines[0]?.split(",").map((h) => h.trim()) ?? [];

  return lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const raw: Record<string, string> = {};
      headers.forEach((header, index) => {
        raw[header] = values[index] ?? "";
      });

      const indexValue = raw.index || raw.Index || "0";
      const addressValue = raw.address || raw.Address || ZERO_ADDRESS;
      const amountValue = raw.amount || raw.Amount || "0";

      return {
        ...raw,
        index: indexValue,
        address: addressValue,
        amount: amountValue,
      } satisfies CsvClaimRow;
    });
}

export async function sortClaimsData(
  csvClaims: CsvClaimRow[],
  trades: Trade[],
  ownerAddress: string,
  fieldName: string,
  orderTimestamp?: string,
  tokenAddress?: string,
  orderHash?: string, // OrderHash to include in claims for date lookup from metadata
  symbol?: string,
  orderStartBlock?: number, // Block when the order was created, for wider scan range
  prefetchedLogs?: HypersyncResult[], // Pre-fetched logs to avoid duplicate Hypersync scans
  source?: OrderbookSource, // OrderBook era (drives amount encoding + self-fetch address/topic)
): Promise<SortedClaimsResult> {
  const encoding: AmountEncoding = source?.amountEncoding ?? "int18";
  // Use pre-fetched logs if available, otherwise fetch independently
  const logs = prefetchedLogs ?? await (async () => {
    const tradeBlockRange = getBlockRangeFromTrades(trades);
    const startBlock = orderStartBlock
      ? Math.min(orderStartBlock, tradeBlockRange.lowest || orderStartBlock)
      : tradeBlockRange.lowest;
    return fetchLogs(
      HYPERSYNC_URL,
      source?.address ?? ORDERBOOK_CONTRACT_ADDRESS,
      source?.contextEventTopic ?? CONTEXT_EVENT_TOPIC,
      startBlock,
    );
  })();

  const normalizedOrderHash = orderHash?.toLowerCase();
  const decodedLogs = logs
    .map((log) => {
      const decodedData = decodeLogData(log.data, encoding);
      if (!decodedData) {
        return null;
      }

      if (log.block?.timestamp !== undefined) {
        const timestampValue =
          typeof log.block.timestamp === "string"
            ? Number.parseInt(log.block.timestamp, 16)
            : log.block.timestamp;
        if (!Number.isNaN(timestampValue)) {
          decodedData.timestamp = new Date(timestampValue * 1000).toISOString();
        }
      } else if (typeof log.timestamp === "number") {
        decodedData.timestamp = new Date(log.timestamp * 1000).toISOString();
      }

      return decodedData;
    })
    .filter((log): log is DecodedClaimLog => {
      if (!log) return false;
      const address = log.address;
      if (!address) return false;
      if (address === ZERO_ADDRESS) return false;
      // Scope claimed-detection to THIS order. Context logs are shared across all
      // orders of a token, and the same CSV (index, amount) can recur across months,
      // so matching by index:amount alone misattributes claims between orders.
      if (normalizedOrderHash && log.orderHash) {
        return log.orderHash.toLowerCase() === normalizedOrderHash;
      }
      return true;
    });

  // Filter by owner address (required parameter)
  const normalizedOwnerAddress = ownerAddress.toLowerCase();

  // Filter CSV claims by owner address
  const filteredCsvClaims = csvClaims.filter(
    (claim) => claim.address.toLowerCase() === normalizedOwnerAddress,
  );

  // Filter decoded logs by owner address
  const filteredDecodedLogs = decodedLogs.filter(
    (log) =>
      log?.address && log.address.toLowerCase() === normalizedOwnerAddress,
  );

  // Filter into claimed and unclaimed arrays
  const { claimedCsv, unclaimedCsv } = filterClaimedAndUnclaimed(
    filteredCsvClaims,
    filteredDecodedLogs,
  );

  // Calculate total amounts
  const totalClaimedAmount = claimedCsv.reduce(
    (sum, claim) => sum + BigInt(claim.amount),
    BigInt(0),
  );

  const totalUnclaimedAmount = unclaimedCsv.reduce(
    (sum, claim) => sum + BigInt(claim.amount),
    BigInt(0),
  );

  const totalEarned = totalClaimedAmount + totalUnclaimedAmount;

  // Create claims array with the same structure as the claims page
  // Include orderHash so caller can look up payout date from metadata
  const claims: ClaimHistory[] = claimedCsv.map((claim) => {
    // Find the Context log for THIS claim to get its transaction hash. Scope by
    // orderHash too: logs are shared across a token's orders and the same
    // (index, address) can recur across months, so matching on those alone could
    // pick another order's claim tx.
    const originalLog = logs.find((log) => {
      const decodedData = decodeLogData(log.data, encoding);
      if (!decodedData) {
        return false;
      }
      if (
        normalizedOrderHash &&
        decodedData.orderHash &&
        decodedData.orderHash.toLowerCase() !== normalizedOrderHash
      ) {
        return false;
      }
      return (
        decodedData.index === claim.index &&
        decodedData.address === claim.address
      );
    });

    // Default to current date - caller should update using orderHash lookup from metadata
    let claimDate = new Date().toISOString();
    if (claim.decodedLog?.timestamp) {
      claimDate = claim.decodedLog.timestamp;
    } else if (originalLog?.block?.timestamp) {
      const timestampValue =
        typeof originalLog.block.timestamp === "number"
          ? originalLog.block.timestamp
          : Number.parseInt(originalLog.block.timestamp, 16);
      if (Number.isFinite(timestampValue)) {
        claimDate = new Date(timestampValue * 1000).toISOString();
      }
    } else if (orderTimestamp) {
      // Use the order timestamp (when the order was added to the orderbook)
      const orderTsNumber = Number(orderTimestamp);
      if (Number.isFinite(orderTsNumber)) {
        claimDate = new Date(orderTsNumber * 1000).toISOString();
      }
    } else if (
      trades.length > 0 &&
      trades[0].tradeEvent?.transaction?.timestamp
    ) {
      // Use the trade timestamp as fallback (all claims in a CSV are from the same payout period)
      const tradeTimestamp = Number(trades[0].tradeEvent.transaction.timestamp);
      if (Number.isFinite(tradeTimestamp)) {
        claimDate = new Date(tradeTimestamp * 1000).toISOString();
      }
    }

    return {
      date: claimDate,
      amount: formatAmountWei(claim.amount),
      asset: fieldName || "Unknown Field",
      // txHash comes from this claim's own Context log (works for both eras and is
      // more accurate than a per-order trade); trades[0] is the legacy fallback.
      txHash:
        originalLog?.transaction_hash ||
        trades[0]?.tradeEvent?.transaction?.id ||
        "N/A",
      status: "completed",
      tokenAddress,
      symbol,
      orderHash, // Include for metadata lookup
    };
  });

  // Create holdings array with the same structure as the claims page
  const holdings: ClaimSignedContext[] = unclaimedCsv.map((claim) => {
    return {
      id: claim.index,
      name: fieldName || "Unknown Field",
      location: "",
      unclaimedAmount: formatAmountWei(claim.amount),
      totalEarned: formatAmountWei(totalEarned),
      lastPayout: new Date().toISOString(),
      lastClaimDate: "",
      status: "producing",
    };
  });

  return {
    claimedCsv,
    unclaimedCsv,
    claims, // Only claimed items - for history display
    holdings,
    totalClaims: filteredCsvClaims.length,
    claimedCount: claimedCsv.length,
    unclaimedCount: unclaimedCsv.length,
    totalClaimedAmount: totalClaimedAmount.toString(),
    totalUnclaimedAmount: totalUnclaimedAmount.toString(),
    totalEarned: totalEarned.toString(),
    ownerAddress: ownerAddress || "all",
  };
}

/**
 * Fetch Context event logs via the server-side cached endpoint.
 * The server maintains a high-water-mark cache — first request does a full scan,
 * subsequent requests only fetch new blocks (delta). This reduces ~24s scans to
 * near-instant on repeat loads.
 */
export async function fetchLogs(
  _client: string,
  poolContract: string,
  eventTopic: string,
  startBlock: number,
): Promise<HypersyncResult[]> {
  if (!startBlock || startBlock <= 0) {
    return [];
  }

  try {
    const response = await axios.post<{
      logs: HypersyncResult[];
      fromCache: boolean;
    }>("/api/context-events", {
      contractAddress: poolContract,
      eventTopic,
      fromBlock: startBlock,
    });

    return response.data?.logs || [];
  } catch (error) {
    console.warn("Context events fetch error, falling back to empty:", error);
    return [];
  }
}

// Function to get the lowest and highest block numbers from trades
export function getBlockRangeFromTrades(trades: Trade[]): {
  lowest: number;
  highest: number;
} {
  if (!trades || trades.length === 0) {
    return { lowest: 0, highest: 0 };
  }

  // Extract block numbers from trades
  const blockNumbers = trades
    .map((trade) => trade.tradeEvent?.transaction?.blockNumber)
    .filter((blockNum) => blockNum !== undefined && blockNum !== null)
    .map((blockNum) => parseInt(blockNum))
    .filter((num) => !isNaN(num));
  if (blockNumbers.length === 0) {
    return { lowest: 0, highest: 0 };
  }

  const lowest = Math.min(...blockNumbers);
  const highest = Math.max(...blockNumbers);

  return { lowest, highest };
}

function toBytes32Hex(v: unknown): string {
  return "0x" + BigInt(v as string | bigint).toString(16).padStart(64, "0");
}

// Decode a Context (v4: uint256[][]) / ContextV2 (v6: bytes32[][]) event log.
// The signed claim context (index, amount, …proof) sits at column 6 (sometimes 5/7/8);
// col[1][0] is the order hash, used to scope claims to a specific order.
// Amounts are normalized to 18-decimal integers regardless of era (v6 Float -> 18dec).
function decodeLogData(
  data: string,
  encoding: AmountEncoding = "int18",
): DecodedClaimLog | null {
  if (!data || data === "0x") {
    return null;
  }
  try {
    const logBytes = ethers.getBytes(data);
    const arrayType = encoding === "float" ? "bytes32[][]" : "uint256[][]";
    const decodedData = abiCoder.decode(["address", arrayType], logBytes);

    const contextColumns = decodedData[1];
    const orderHash =
      contextColumns[1] && contextColumns[1].length >= 1
        ? toBytes32Hex(contextColumns[1][0])
        : undefined;

    let claimIndex: string | undefined;
    let claimAmount: string | undefined;

    const columnsToCheck = [6, 5, 7, 8];
    for (const colIdx of columnsToCheck) {
      const col = contextColumns[colIdx];
      if (col && col.length >= 2) {
        claimIndex = BigInt(col[0]).toString();
        claimAmount =
          encoding === "float"
            ? amount18FromFloatHex(toBytes32Hex(col[1])).toString()
            : col[1].toString();
        break;
      }
    }

    if (claimIndex === undefined || claimAmount === undefined) {
      return null;
    }

    return {
      orderHash,
      index: claimIndex,
      address: decodedData[0],
      amount: claimAmount,
    };
  } catch {
    // Return null instead of a fake entry - don't mask real claim data
    return null;
  }
}

// Function to filter CSV claims into claimed and unclaimed arrays.
// Uses composite (index, amount) matching to prevent cross-order contamination
// when multiple orders are claimed in the same transaction.
function filterClaimedAndUnclaimed(
  csvClaims: CsvClaimRow[],
  decodedLogs: DecodedClaimLog[],
): {
  claimedCsv: ClaimedCsvRow[];
  unclaimedCsv: UnclaimedCsvRow[];
} {
  // Create a set of claimed (index, amount) pairs for accurate matching.
  // Using both index AND amount prevents false matches from Context events
  // that belong to different orders but share the same CSV index — critical
  // now that Hypersync logs are fetched once and shared across all orders
  // for a token.
  const claimedKeys = new Set(
    decodedLogs.map((log) => `${log.index}:${log.amount}`),
  );

  const claimedCsv: ClaimedCsvRow[] = [];
  const unclaimedCsv: UnclaimedCsvRow[] = [];

  csvClaims.forEach((claim) => {
    const compositeKey = `${claim.index}:${claim.amount}`;
    const isClaimed = claimedKeys.has(compositeKey);

    if (isClaimed) {
      const decodedLog = decodedLogs.find(
        (log) => log.index === claim.index && log.amount === claim.amount,
      );
      claimedCsv.push({
        ...claim,
        claimed: true,
        decodedLog: decodedLog ?? null,
      });
    } else {
      unclaimedCsv.push({
        index: claim.index,
        address: claim.address,
        amount: claim.amount,
        claimed: false,
      });
    }
  });

  return {
    claimedCsv,
    unclaimedCsv,
  };
}

export function getLeaf(
  index: string,
  address: string,
  amount: string,
  encoding: AmountEncoding = "int18",
) {
  const indexAsUint256 = BigInt(index);
  const addressAsUint256 = BigInt(address);
  // v4: raw 18-dec integer; v6: Float bytes32 (as a uint256 word) of the same value.
  const amount18 = BigInt(parseEther(amount));
  const amountAsUint256 =
    encoding === "float" ? floatWordFromAmount18(amount18) : amount18;

  // Create inputs array like in Solidity: uint256[] memory inputs = [indexAsUint256, addressAsUint256, amountAsUint256]
  const inputs = [indexAsUint256, addressAsUint256, amountAsUint256];

  // Pack the inputs array like abi.encodePacked(inputs) in Solidity
  const packed = inputs
    .map((input) => input.toString(16).padStart(64, "0"))
    .join("");

  // Hash the packed data (single hash, matching Solidity)
  return keccak256("0x" + packed);
}

export function getMerkleTree(
  csvInput: CsvClaimRow[],
  encoding: AmountEncoding = "int18",
) {
  const leaves = csvInput.map((row) => {
    // Handle CSV data format - row is an object with properties
    const index = row.index || "0";
    const address = row.address || ZERO_ADDRESS;
    const amount = row.amount || "0";

    // Convert address to uint256 (like uint256(uint160(address)) in Solidity)
    const indexAsUint256 = BigInt(index);
    const addressAsUint256 = BigInt(address);
    // CSV amounts are raw 18-dec integers. v6 hashes the Float-encoded amount instead.
    const amountAsUint256 =
      encoding === "float" ? floatWordFromAmount18(BigInt(amount)) : BigInt(amount);

    // Create inputs array like in Solidity: uint256[] memory inputs = [indexAsUint256, addressAsUint256, amountAsUint256]
    const inputs = [indexAsUint256, addressAsUint256, amountAsUint256];

    // Pack the inputs array like abi.encodePacked(inputs) in Solidity
    const packed = inputs
      .map((input) => input.toString(16).padStart(64, "0"))
      .join("");

    // Hash the packed data (single hash, matching Solidity)
    return keccak256("0x" + packed);
  });

  const tree = SimpleMerkleTree.of(leaves);

  return tree;
}

export function getProofForLeaf(tree: SimpleMerkleTree, leafValue: string) {
  // Find the leaf in the tree entries
  let leafIndex = -1;
  for (const [i, v] of tree.entries()) {
    if (v === leafValue) {
      leafIndex = i;
      break;
    }
  }

  if (leafIndex === -1) {
    throw new Error(`Leaf node ${leafValue} not found in the tree`);
  }

  // Get the proof for the found index
  const proof = tree.getProof(leafIndex);

  return {
    leafValue: leafValue,
    leafIndex: leafIndex,
    proof: proof,
  };
}

export function decodeOrder(
  orderBytes: string,
  version: "v4" | "v6" = "v4",
): OrderV3Type {
  const [order] = abiCoder.decode(
    [version === "v6" ? OrderV4 : OrderV3],
    orderBytes,
  );
  return order;
}

/**
 * Returns a SignedContextV1-like object for a given context (uint256[])
 * using a randomly generated wallet.
 * @param {Array<string|bigint|number>} context - Array of uint256
 * @returns {{signer: string, context: Array, signature: Uint8Array}}
 */
export function signContext(
  context: Array<string | bigint | number>,
): SignedContextV1Type {
  const wallet = Wallet.createRandom();

  const signer = wallet.address;

  // 2. Encode uint256[] context as tightly packed bytes (like abi.encodePacked in Solidity)
  const contextBytes = concat(
    context.map((n) => {
      // Always convert to wei for amounts (assuming index 1 is the amount)
      const value =
        typeof n === "string" && n.includes(".")
          ? parseEther(n).toString()
          : n.toString();
      return getBytes("0x" + BigInt(value).toString(16).padStart(64, "0"));
    }),
  );

  // 3. Hash the packed context (contextHash)
  const contextHash = keccak256(contextBytes);

  // 4. HashMessage = ECDSA.toEthSignedMessageHash(contextHash)
  const digest = hashMessage(getBytes(contextHash));

  // 5. Sign the digest
  const signature = wallet.signingKey.sign(digest);
  // In ethers v6, sign returns a Signature object directly
  const signatureBytes = concat([
    getBytes(signature.r),
    getBytes(signature.s),
    Uint8Array.from([signature.v]),
  ]);

  // 6. Return as SignedContextV1
  return {
    signer,
    context,
    signature: signatureBytes,
  };
}

export type { CsvClaimRow };
