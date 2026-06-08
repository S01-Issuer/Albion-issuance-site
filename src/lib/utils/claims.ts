import { ORDERBOOK_CONTRACT_ADDRESS, type OrderbookSource } from "$lib/network";
import {
  floatHexFromFixedDecimal,
  floatWordFromAmount18,
  floatWordFromIndex,
} from "$lib/utils/float";
import type { Trade } from "$lib/types/graphql";

/** Amount encoding for an OrderBook era: v4 = raw 18-dec integers, v6 = Float bytes32. */
export type AmountEncoding = "int18" | "float";
import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";
import { AbiCoder } from "ethers";
import axios from "axios";
import { ethers, Signature } from "ethers";
import { Wallet, keccak256, hashMessage, getBytes, concat, hexlify } from "ethers";
import { decodeOrderBytes, normalizeOrderForSdk } from "$lib/utils/orderbook";
import type { OrderV4 as OrderV4Type } from "@rainlanguage/orderbook";
import { formatEther, parseEther } from "viem";

// Create a singleton AbiCoder instance for reuse
// This works in both production and test environments
const abiCoder = AbiCoder.defaultAbiCoder();

export const HYPERSYNC_URL = "https://8453.hypersync.xyz/query";
export const CONTEXT_EVENT_TOPIC =
  "0x17a5c0f3785132a57703932032f6863e7920434150aa1dc940e567b440fdce1f";
const CLAIM_RECEIPT_LOGS_API = "/api/claim-receipt-logs";
const CLAIM_TX_STORAGE_KEY = "albion-recent-claim-txs";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Remember claim tx hashes for receipt-log fallback until Hypersync indexes. */
export function recordClaimTransactionHashes(hashes: string[]): void {
  if (typeof sessionStorage === "undefined" || hashes.length === 0) return;
  try {
    const prev = JSON.parse(
      sessionStorage.getItem(CLAIM_TX_STORAGE_KEY) ?? "[]",
    ) as string[];
    const merged = [
      ...new Set([
        ...prev.map((h) => h.toLowerCase()),
        ...hashes.map((h) => h.toLowerCase()),
      ]),
    ].slice(-20);
    sessionStorage.setItem(CLAIM_TX_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getStoredClaimTransactionHashes(): string[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(CLAIM_TX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const IO = "(address token, uint8 decimals, uint256 vaultId)";
const EvaluableV3 = "(address interpreter, address store, bytes bytecode)";
const OrderV3 = `(address owner, ${EvaluableV3} evaluable, ${IO}[] validInputs, ${IO}[] validOutputs, bytes32 nonce)`;
// v6 OrderV4: IO drops the `decimals` field and vaultId becomes bytes32.
const IOV2 = "(address token, bytes32 vaultId)";
const OrderV4_ABI = `(address owner, ${EvaluableV3} evaluable, ${IOV2}[] validInputs, ${IOV2}[] validOutputs, bytes32 nonce)`;

type OrderV3Type = [
  string,
  [string, string, string],
  [string, number, string][],
  [string, number, string][],
  string,
];
export type SignedContextV1Type = {
  signer: string;
  context: (string | number | bigint)[];
  signature: string;
};

interface DecodedClaimLog {
  index: string;
  address: string;
  amount: string;
  /** Order hash from Context column 1 when present (may be metadata, not deploy hash). */
  orderHash?: string;
  txHash?: string;
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
  /** Raw wei from CSV — used for Float merkle leaves and signed context. */
  amountWei?: string;
  unclaimedAmount: string;
  totalEarned: string;
  lastPayout: string;
  lastClaimDate: string;
  status: string;
  order?: OrderV3Type | OrderV4Type;
  signedContext?: SignedContextV1Type;
  orderBookAddress?: string;
};

export const CLAIM_MERKLE_PROOF_DEPTH = 8;

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
  extraClaimTxHashes?: string[], // Recent claim txs (receipt fallback when subgraph/Hypersync lag)
  expectedMerkleRoot?: string, // v6: scope Context logs to this order's merkle root
): Promise<SortedClaimsResult> {
  const encoding: AmountEncoding = source?.amountEncoding ?? "int18";
  const orderbookAddress =
    source?.address ?? ORDERBOOK_CONTRACT_ADDRESS;
  const tradeBlockRange = getBlockRangeFromTrades(trades);
  const startBlock = orderStartBlock
    ? Math.min(orderStartBlock, tradeBlockRange.lowest || orderStartBlock)
    : tradeBlockRange.lowest;

  const hypersyncLogs =
    prefetchedLogs ??
    (startBlock > 0
      ? await fetchLogs(
          HYPERSYNC_URL,
          orderbookAddress,
          source?.contextEventTopics?.length
            ? source.contextEventTopics
            : (source?.contextEventTopic ?? CONTEXT_EVENT_TOPIC),
          startBlock,
        )
      : []);

  const receiptFromTrades =
    trades.length > 0
      ? await fetchLogsFromTradeReceipts(trades, orderbookAddress)
      : [];
  const receiptFromTxs =
    extraClaimTxHashes && extraClaimTxHashes.length > 0
      ? await fetchLogsFromTransactionHashes(
          extraClaimTxHashes,
          orderbookAddress,
        )
      : [];

  const logs = [...hypersyncLogs, ...receiptFromTrades, ...receiptFromTxs];

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

      return {
        ...decodedData,
        txHash: log.transaction_hash,
      };
    })
    .filter((log) => {
      if (!log) return false;
      const address = log.address;
      if (!address) return false;
      if (address === ZERO_ADDRESS) return false;
      // Do not filter by col[1] order hash — on v6 it is often merkle metadata,
      // not the subgraph orderHash. This call is already scoped to one order's CSV.
      return true;
    }) as DecodedClaimLog[];

  // Filter by owner address (required parameter)
  const normalizedOwnerAddress = ownerAddress.toLowerCase();

  // Filter CSV claims by owner address
  const filteredCsvClaims = csvClaims.filter(
    (claim) => claim.address.toLowerCase() === normalizedOwnerAddress,
  );

  // Filter decoded logs by owner address. For v6, also scope to this order's
  // merkle root (Context col[1]) so shared per-OrderBook logs do not mark
  // another order's payout as claimed.
  const normalizedMerkleRoot = expectedMerkleRoot?.toLowerCase();
  const filteredDecodedLogs = decodedLogs.filter((log) => {
    if (!log?.address || log.address.toLowerCase() !== normalizedOwnerAddress) {
      return false;
    }
    // v6: col[1] is this order's merkle root — require it so shared OB logs
    // cannot mark another monthly order's payout as claimed/unclaimed.
    if (encoding === "float" && normalizedMerkleRoot) {
      if (!log.orderHash) return false;
      return log.orderHash.toLowerCase() === normalizedMerkleRoot;
    }
    return true;
  });

  // Filter into claimed and unclaimed arrays
  const { claimedCsv, unclaimedCsv } = filterClaimedAndUnclaimed(
    filteredCsvClaims,
    filteredDecodedLogs,
    encoding,
    expectedMerkleRoot,
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
    const originalLog = logs.find((log) => {
      const decodedData = decodeLogData(log.data, encoding);
      if (!decodedData) return false;
      return decodedLogMatchesClaim(
        { ...decodedData, txHash: log.transaction_hash },
        claim,
        encoding,
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
        claim.decodedLog?.txHash ||
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
      amountWei: claim.amount.toString(),
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
  eventTopic: string | string[],
  startBlock: number,
  forceRefresh = false,
): Promise<HypersyncResult[]> {
  if (!startBlock || startBlock <= 0) {
    return [];
  }

  const eventTopics = Array.isArray(eventTopic) ? eventTopic : [eventTopic];

  try {
    const response = await axios.post<{
      logs: HypersyncResult[];
      fromCache: boolean;
    }>("/api/context-events", {
      contractAddress: poolContract,
      eventTopics,
      fromBlock: startBlock,
      forceRefresh,
    });

    return response.data?.logs || [];
  } catch (error) {
    console.warn("Context events fetch error, falling back to empty:", error);
    return [];
  }
}

/** Decode Context logs from indexed take/claim txs when Hypersync is empty or lagging. */
async function fetchLogsFromTradeReceipts(
  trades: Trade[],
  orderbookAddress: string,
): Promise<HypersyncResult[]> {
  const transactionHashes = [
    ...new Set(
      trades
        .map((trade) => trade.tradeEvent?.transaction?.id)
        .filter((id): id is string => Boolean(id))
        .map((id) => id.toLowerCase()),
    ),
  ];
  return fetchLogsFromTransactionHashes(transactionHashes, orderbookAddress);
}

async function fetchLogsFromTransactionHashes(
  transactionHashes: string[],
  orderbookAddress: string,
): Promise<HypersyncResult[]> {
  if (transactionHashes.length === 0) return [];

  try {
    const response = await axios.post<{
      logs: Array<{
        block_number: string;
        transaction_hash: string;
        data: string;
        timestamp: number | null;
      }>;
    }>(CLAIM_RECEIPT_LOGS_API, {
      transactionHashes,
      orderbookAddress,
    });
    const receiptLogs = response.data?.logs ?? [];
    return receiptLogs.map(
      (log): HypersyncResult => ({
        block_number: log.block_number,
        log_index: "0",
        transaction_index: "0",
        transaction_hash: log.transaction_hash,
        data: log.data,
        address: orderbookAddress,
        topic0: "0x0",
        timestamp: log.timestamp,
        block: {
          timestamp: log.timestamp ?? 0,
        },
      }),
    );
  } catch (error) {
    console.warn("Claim receipt log fallback failed:", error);
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
  return (
    "0x" +
    BigInt(v as string | bigint)
      .toString(16)
      .padStart(64, "0")
  );
}

// Decode a Context / ContextV2 event log from either era.
// Both v4 (Context(address,uint256[][])) and v6 (ContextV2(address,bytes32[][])) have
// the same on-wire 32-byte-per-element format, so we always decode as uint256[][].
// The signed claim context (index, amount, …proof) sits at column 6 (sometimes 5/7/8);
// col[1][0] is the order hash, used to scope claims to a specific order.
// For v6, slot[0] is Float(index,0) and slot[1] is Float(amount,18) — we convert both
// back to their plain integer forms so they match raw CSV values.
function decodeLogData(
  data: string,
  encoding: AmountEncoding = "int18",
): DecodedClaimLog | null {
  if (!data || data === "0x") {
    return null;
  }
  try {
    const logBytes = ethers.getBytes(data);
    const decodedData = abiCoder.decode(["address", "uint256[][]"], logBytes);

    const contextColumns = decodedData[1] as bigint[][];
    const orderHash =
      contextColumns[1] && contextColumns[1].length >= 1
        ? toBytes32Hex(contextColumns[1][0])
        : undefined;

    let claimIndex: string | undefined;
    let claimAmount: string | undefined;

    const columnsToCheck = [6, 5, 7, 8, 0, 1, 2, 3, 4, 9];
    for (const colIdx of columnsToCheck) {
      const col = contextColumns[colIdx];
      if (col && col.length >= 2) {
        if (encoding === "float") {
          // v6: on-wire Float words as uint256; match via floatContextSlot* helpers
          claimIndex = col[0].toString();
          claimAmount = col[1].toString();
        } else {
          claimIndex = col[0].toString();
          claimAmount = col[1].toString();
        }
        break;
      }
    }

    if (claimIndex === undefined || claimAmount === undefined) {
      return null;
    }

    return {
      orderHash,
      index: claimIndex,
      address: decodedData[0] as string,
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
function decodedLogMatchesClaim(
  log: DecodedClaimLog,
  claim: { index: string; amount: string; address: string },
  encoding: AmountEncoding,
): boolean {
  if (log.address.toLowerCase() !== claim.address.toLowerCase()) {
    return false;
  }
  const indexMatch =
    log.index === claim.index ||
    (encoding === "float" && log.index === floatContextSlotIndex(claim.index));
  const amountMatch =
    log.amount === claim.amount ||
    (encoding === "float" &&
      log.amount === floatContextSlotAmount(claim.amount));
  return indexMatch && amountMatch;
}

function filterClaimedAndUnclaimed(
  csvClaims: CsvClaimRow[],
  decodedLogs: DecodedClaimLog[],
  encoding: AmountEncoding = "int18",
  expectedMerkleRoot?: string,
): {
  claimedCsv: ClaimedCsvRow[];
  unclaimedCsv: UnclaimedCsvRow[];
} {
  const claimedCsv: ClaimedCsvRow[] = [];
  const unclaimedCsv: UnclaimedCsvRow[] = [];
  const normalizedMerkleRoot = expectedMerkleRoot?.toLowerCase();

  csvClaims.forEach((claim) => {
    const decodedLog = decodedLogs.find((log) => {
      if (
        encoding === "float" &&
        normalizedMerkleRoot &&
        log.orderHash?.toLowerCase() !== normalizedMerkleRoot
      ) {
        return false;
      }
      return decodedLogMatchesClaim(log, claim, encoding);
    });

    if (decodedLog) {
      claimedCsv.push({
        ...claim,
        claimed: true,
        decodedLog,
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

function amountWeiFromArg(amount: string, encoding: AmountEncoding): bigint {
  if (encoding === "float") {
    return amount.includes(".") ? BigInt(parseEther(amount)) : BigInt(amount);
  }
  return amount.includes(".") ? BigInt(parseEther(amount)) : BigInt(amount);
}

export function getLeaf(
  index: string,
  address: string,
  amount: string,
  encoding: AmountEncoding = "int18",
) {
  const rawIndex = BigInt(index);
  const addressAsUint256 = BigInt(address);
  const amountWei = amountWeiFromArg(amount, encoding);

  // v6 (Float): leaf = Float(index,0) || address || Float(amount,18)
  // v4 (int18): leaf = index || address || amount_wei
  const indexAsUint256 =
    encoding === "float" ? floatWordFromIndex(rawIndex) : rawIndex;
  const amountAsUint256 =
    encoding === "float"
      ? floatWordFromAmount18(amountWei)
      : amountWei;

  const inputs = [indexAsUint256, addressAsUint256, amountAsUint256];
  const packed = inputs
    .map((input) => input.toString(16).padStart(64, "0"))
    .join("");
  return keccak256("0x" + packed);
}

export function getMerkleTree(
  csvInput: CsvClaimRow[],
  encoding: AmountEncoding = "int18",
) {
  const leaves = csvInput.map((row) => {
    const index = row.index || "0";
    const address = row.address || ZERO_ADDRESS;
    const amount = row.amount || "0";

    const rawIndex = BigInt(index);
    const addressAsUint256 = BigInt(address);

    // v6 (Float): leaf = Float(index,0) || address || Float(amount,18)
    // v4 (int18): leaf = index || address || amount_wei
    const indexAsUint256 =
      encoding === "float" ? floatWordFromIndex(rawIndex) : rawIndex;
    const amountAsUint256 =
      encoding === "float"
        ? floatWordFromAmount18(amountWeiFromArg(amount, encoding))
        : amountWeiFromArg(amount, encoding);

    const inputs = [indexAsUint256, addressAsUint256, amountAsUint256];
    const packed = inputs
      .map((input) => input.toString(16).padStart(64, "0"))
      .join("");
    return keccak256("0x" + packed);
  });

  return SimpleMerkleTree.of(leaves);
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
): OrderV3Type | OrderV4Type {
  if (version === "v6") {
    return decodeOrderBytes(orderBytes);
  }
  const [order] = abiCoder.decode([OrderV3], orderBytes);
  return order;
}

function floatContextSlotIndex(index: string | bigint): string {
  return BigInt(floatHexFromFixedDecimal(BigInt(index), 0)).toString();
}

function floatContextSlotAmount(amountWei: string | bigint): string {
  return BigInt(floatHexFromFixedDecimal(BigInt(amountWei), 18)).toString();
}

function floatContextSlots(
  index: string | bigint,
  amountWei: string | bigint,
): [`0x${string}`, `0x${string}`] {
  return [
    floatHexFromFixedDecimal(BigInt(index), 0),
    floatHexFromFixedDecimal(BigInt(amountWei), 18),
  ];
}

/** Format uint256 / Float words as bytes32 hex for takeOrders3 signedContext. */
export function formatUint256Hex(value: string | bigint | number): string {
  if (typeof value === "string" && value.startsWith("0x")) {
    const hex = value.slice(2).padStart(64, "0").slice(-64);
    return `0x${hex}`;
  }
  const raw =
    typeof value === "string" && value.includes(".")
      ? parseEther(value).toString()
      : value.toString();
  return `0x${BigInt(raw).toString(16).padStart(64, "0")}`;
}

export function formatSignatureHex(signature: string | Uint8Array): string {
  if (typeof signature === "string") {
    return signature.startsWith("0x") ? signature : `0x${signature}`;
  }
  return hexlify(signature);
}

/**
 * Build signed context for claims.rain: [index, amount, proof…].
 * Float orders use Float-encoded slots 0–1; int18 orders use raw uint256 wei.
 */
export function buildClaimSignedContext(
  index: string | bigint,
  amountWei: string | bigint,
  proof: string[],
  encoding: AmountEncoding = "int18",
): SignedContextV1Type {
  const proofSlots = proof.slice(0, CLAIM_MERKLE_PROOF_DEPTH).map((p) => BigInt(p));
  while (proofSlots.length < CLAIM_MERKLE_PROOF_DEPTH) {
    proofSlots.push(0n);
  }

  const [indexSlot, amountSlot] =
    encoding === "float"
      ? floatContextSlots(index, amountWei)
      : [BigInt(index), BigInt(amountWei)];

  return signContext([indexSlot, amountSlot, ...proofSlots], encoding);
}

/**
 * Returns a SignedContextV1-like object for a given context (uint256[])
 * using a randomly generated wallet.
 * @param {Array<string|bigint|number>} context - Array of uint256
 * @returns {{signer: string, context: Array, signature: Uint8Array}}
 */
export function signContext(
  context: Array<string | bigint | number>,
  encoding: AmountEncoding = "int18",
): SignedContextV1Type {
  const wallet = Wallet.createRandom();
  const signer = wallet.address;
  const contextHex = context.map((n) =>
    typeof n === "string" && n.startsWith("0x") && n.length === 66
      ? n
      : formatUint256Hex(n),
  );

  const contextBytes = concat(contextHex.map((h) => getBytes(h)));
  const contextHash = keccak256(contextBytes);
  const digest = hashMessage(getBytes(contextHash));
  const signatureHex = wallet.signingKey.sign(digest);
  const signature = Signature.from(signatureHex);
  const signatureBytes = concat([
    getBytes(signature.r),
    getBytes(signature.s),
    Uint8Array.from([signature.v]),
  ]);

  return {
    signer,
    context: encoding === "float" ? contextHex : context,
    signature: formatSignatureHex(signatureBytes),
  };
}

export { normalizeOrderForSdk };

export type { CsvClaimRow };
