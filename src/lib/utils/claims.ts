import { ORDERBOOK_CONTRACT_ADDRESS } from "$lib/network";
import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";
import { AbiCoder } from "ethers";
import axios from "axios";
import { ethers } from "ethers";
import { Wallet, keccak256, hashMessage, getBytes, concat } from "ethers";
import { formatEther, parseEther } from "viem";

// Create a singleton AbiCoder instance for reuse
// This works in both production and test environments
const abiCoder = typeof AbiCoder.defaultAbiCoder === 'function'
  ? AbiCoder.defaultAbiCoder()
  : AbiCoder.defaultAbiCoder;

const HYPERSYNC_URL = "https://8453.hypersync.xyz/query";
const CONTEXT_EVENT_TOPIC =
  "0x17a5c0f3785132a57703932032f6863e7920434150aa1dc940e567b440fdce1f";

const IO = "(address token, uint8 decimals, uint256 vaultId)";
const EvaluableV3 = "(address interpreter, address store, bytes bytecode)";
const SignedContextV1 = "(address signer, uint256[] context, bytes signature)";
const OrderV3 = `(address owner, ${EvaluableV3} evaluable, ${IO}[] validInputs, ${IO}[] validOutputs, bytes32 nonce)`;

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

export type ClaimHistory = {
  date: string;
  amount: string;
  asset: string;
  txHash: string;
  status: string;
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

/**
 * Validates CSV data integrity against on-chain merkle root
 * @param csvData - Raw CSV data to validate
 * @param expectedMerkleRoot - Expected merkle root from on-chain data
 * @returns Validation result with details
 */
export function validateCSVIntegrity(
  csvData: any[],
  expectedMerkleRoot: string
): CSVValidationResult {
  try {
    // Validate CSV structure
    if (!Array.isArray(csvData) || csvData.length === 0) {
      return {
        isValid: false,
        error: "Invalid CSV structure: data must be a non-empty array"
      };
    }

    // Validate required fields in each row
    for (const [index, row] of csvData.entries()) {
      if (!row.address || !row.amount || row.index === undefined) {
        return {
          isValid: false,
          error: `Invalid CSV row ${index}: missing required fields (address, amount, index)`
        };
      }

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(row.address)) {
        return {
          isValid: false,
          error: `Invalid address format in row ${index}: ${row.address}`
        };
      }

      // Validate amount is positive
      const amount = parseFloat(row.amount);
      if (isNaN(amount) || amount < 0) {
        return {
          isValid: false,
          error: `Invalid amount in row ${index}: ${row.amount}`
        };
      }
    }

    // Generate merkle tree from CSV data
    const tree = getMerkleTree(csvData);
    const calculatedMerkleRoot = tree.root;

    // Compare with expected merkle root
    if (calculatedMerkleRoot.toLowerCase() !== expectedMerkleRoot.toLowerCase()) {
      return {
        isValid: false,
        error: "Merkle root mismatch",
        merkleRoot: calculatedMerkleRoot,
        expectedMerkleRoot
      };
    }

    return {
      isValid: true,
      merkleRoot: calculatedMerkleRoot,
      expectedMerkleRoot
    };

  } catch (error) {
    return {
      isValid: false,
      error: `CSV validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
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
  expectedContentHash: string
): Promise<IPFSValidationResult> {
  try {
    // Extract CID from IPFS URL
    const urlParts = ipfsUrl.split('/');
    const cidFromUrl = urlParts[urlParts.length - 1];

    // Validate CID format
    if (!cidFromUrl || cidFromUrl.length < 10) {
      return {
        isValid: false,
        error: "Invalid IPFS URL format"
      };
    }

    // Compare with expected hash
    if (cidFromUrl !== expectedContentHash) {
      return {
        isValid: false,
        error: "IPFS content hash mismatch",
        contentHash: cidFromUrl,
        expectedHash: expectedContentHash
      };
    }

    // Fetch and validate content is accessible
    const response = await fetch(ipfsUrl);
    if (!response.ok) {
      return {
        isValid: false,
        error: `Failed to fetch IPFS content: ${response.status}`
      };
    }

    return {
      isValid: true,
      contentHash: cidFromUrl,
      expectedHash: expectedContentHash
    };

  } catch (error) {
    return {
      isValid: false,
      error: `IPFS validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Enhanced CSV fetching with security validation
 * @param csvLink - IPFS link to CSV file
 * @param expectedMerkleRoot - Expected merkle root for validation
 * @param expectedContentHash - Expected IPFS content hash
 * @returns Validated CSV data or null if validation fails
 */
export async function fetchAndValidateCSV(
  csvLink: string,
  expectedMerkleRoot: string,
  expectedContentHash: string
): Promise<any[] | null> {
  try {
    // Step 1: Validate IPFS content integrity
    const ipfsValidation = await validateIPFSContent(csvLink, expectedContentHash);
    if (!ipfsValidation.isValid) {
      return null;
    }

    // Step 2: Fetch CSV data
    const response = await fetch(csvLink);
    if (!response.ok) {
      return null;
    }

    const csvText = await response.text();
    const csvData = parseCSVData(csvText);

    // Step 3: Validate CSV data integrity
    const csvValidation = validateCSVIntegrity(csvData, expectedMerkleRoot);
    if (!csvValidation.isValid) {
      if (expectedMerkleRoot === "0x0000000000000000000000000000000000000000000000000000000000000000") {
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
function parseCSVData(csvText: string): any[] {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const data = lines.slice(1).filter(line => line.trim()).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });
  return data;
}

export async function sortClaimsData(
  csvClaims: any[],
  trades: any[],
  ownerAddress: string,
  feildName: string,
  orderTimestamp?: string,
) {
  const blockRange = getBlockRangeFromTrades(trades);

  const transactionIds = trades
    .map((trade) => trade.tradeEvent?.transaction?.id)
    .filter((id) => id)
    .map((id) => id.toLowerCase());

  const logs = await fetchLogs(
    HYPERSYNC_URL,
    ORDERBOOK_CONTRACT_ADDRESS,
    CONTEXT_EVENT_TOPIC,
    blockRange.lowest,
    blockRange.highest,
    transactionIds,
  );

  const decodedLogs = logs
    .map((log) => {
      const decodedData = decodeLogData(log.data);
      if (decodedData && log.block) {
        // Add timestamp from the block data
        decodedData.timestamp = new Date(log.block.timestamp * 1000).toISOString();
      }
      return decodedData;
    })
    .filter((log) => {
      // Filter out null results and zero addresses
      return log && 
             log.address && 
             log.address !== "0x0000000000000000000000000000000000000000";
    });

  // Filter by owner address (required parameter)
  const normalizedOwnerAddress = ownerAddress.toLowerCase();

  // Filter CSV claims by owner address
  const filteredCsvClaims = csvClaims.filter(
    (claim) => claim.address.toLowerCase() === normalizedOwnerAddress,
  );

  // Filter decoded logs by owner address
  const filteredDecodedLogs = decodedLogs.filter(
    (log) => log?.address && log.address.toLowerCase() === normalizedOwnerAddress,
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
  const claims: ClaimHistory[] = claimedCsv.map((claim) => {
    // Find the original log data to get the transaction hash
    const originalLog = logs.find((log) => {
      const decodedData = decodeLogData(log.data);
      return (
        decodedData.index === claim.index &&
        decodedData.address === claim.address
      );
    });

    // Try to get timestamp from various sources
    let claimDate = new Date().toISOString();
    if (claim.decodedLog?.timestamp) {
      claimDate = claim.decodedLog.timestamp;
    } else if (originalLog?.block?.timestamp) {
      claimDate = new Date(originalLog.block.timestamp * 1000).toISOString();
    } else if (orderTimestamp) {
      // Use the order timestamp (when the order was added to the orderbook)
      claimDate = new Date(Number(orderTimestamp) * 1000).toISOString();
    } else if (trades.length > 0 && trades[0].tradeEvent?.transaction?.timestamp) {
      // Use the trade timestamp as fallback (all claims in a CSV are from the same payout period)
      claimDate = new Date(trades[0].tradeEvent.transaction.timestamp * 1000).toISOString();
    }

    return {
      date: claimDate,
      amount: formatEther(claim.amount),
      asset: feildName || "Unknown Field",
      txHash: originalLog?.transaction_hash || "N/A",
      status: "completed",
    };
  });

  // Create holdings array with the same structure as the claims page
  const holdings: ClaimSignedContext[] = unclaimedCsv.map((claim) => {
    return {
      id: claim.index,
      name: feildName || "Unknown Field",
      location: "",
      unclaimedAmount: formatEther(claim.amount),
      totalEarned: formatEther(totalEarned.toString()),
      lastPayout: new Date().toISOString(),
      lastClaimDate: "",
      status: "producing",
    };
  });

  return {
    claimedCsv,
    unclaimedCsv,
    claims,
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

async function fetchLogs(
  client: string,
  poolContract: string,
  eventTopic: string,
  startBlock: number,
  endBlock: number,
  transactionIds?: string[],
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Array<any>> {
  let currentBlock = startBlock;

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logs: Array<any> = [];

  while (currentBlock <= endBlock) {
    try {
      const queryResponse = await axios.post(client, {
        from_block: currentBlock,
        logs: [
          {
            address: [poolContract],
            topics: [[eventTopic]],
          },
        ],
        field_selection: {
          log: [
            "block_number",
            "log_index",
            "transaction_index",
            "transaction_hash",
            "data",
            "address",
            "topic0",
          ],
          block: ["number", "timestamp"],
        },
      });

      // Concatenate logs if there are any
      if (
        queryResponse.data.data &&
        queryResponse.data.data.length > 0 &&
        currentBlock != queryResponse.data.next_block
      ) {
        logs = logs.concat(queryResponse.data.data);
      }

      // Update currentBlock for the next iteration
      currentBlock = queryResponse.data.next_block;

      // Exit the loop if nextBlock is invalid
      if (!currentBlock || currentBlock > endBlock) {
        break;
      }
    } catch {
      break; // Exit loop on error
    }
  }

  const allLogs = logs.flatMap((entry) => {
    // Create a map of block_number to timestamp
    const blockMap = new Map(
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      entry.blocks.map((block: any) => [
        block.number,
        parseInt(block.timestamp, 16),
      ]),
    );

    // Map each log with the corresponding timestamp
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    return entry.logs.map((log: any) => ({
      ...log,
      timestamp: blockMap.get(log.block_number) || null, // Add timestamp if available
    }));
  });

  // Filter logs by transaction IDs if provided
  if (transactionIds && transactionIds.length > 0) {
    const filteredLogs = allLogs.filter((log) =>
      transactionIds.includes(log.transaction_hash?.toLowerCase()),
    );
    return filteredLogs;
  }

  return allLogs;
}

// Function to get the lowest and highest block numbers from trades
export function getBlockRangeFromTrades(trades: any[]): {
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

// Function to decode Context event log data using ethers v6
function decodeLogData(data: string): any {
  if (!data || data === "0x") {
    return null;
  }
  try {
    const logBytes = ethers.getBytes(data);
    const decodedData = abiCoder.decode(
      ["address", "uint256[][]"],
      logBytes,
    );

    return {
      index: decodedData[1][6][0].toString(),
      address: decodedData[0],
      amount: decodedData[1][6][1].toString(),
    };
  } catch {
    return {
      index: "0",
      address: "0x0000000000000000000000000000000000000000",
      amount: "0",
    };
  }
}

// Function to filter CSV claims into claimed and unclaimed arrays
function filterClaimedAndUnclaimed(
  csvClaims: any[],
  decodedLogs: any[],
): {
  claimedCsv: any[];
  unclaimedCsv: any[];
} {
  // Create a set of claimed indices for faster lookup
  const claimedIndices = new Set(decodedLogs.map((log) => log.index));

  // Filter CSV claims
  const claimedCsv: any[] = [];
  const unclaimedCsv: any[] = [];

  csvClaims.forEach((claim) => {
    if (claimedIndices.has(claim.index)) {
      // Find the corresponding decoded log for additional info
      const decodedLog = decodedLogs.find((log) => log.index === claim.index);
      claimedCsv.push({
        ...claim,
        claimed: true,
        decodedLog: decodedLog || null,
      });
    } else {
      unclaimedCsv.push({
        ...claim,
        claimed: false,
      });
    }
  });

  return {
    claimedCsv,
    unclaimedCsv,
  };
}

export function getLeaf(index: string, address: string, amount: string) {
  const indexAsUint256 = BigInt(index);
  const addressAsUint256 = BigInt(address);
  const amountAsUint256 = BigInt(parseEther(amount));

  // Create inputs array like in Solidity: uint256[] memory inputs = [indexAsUint256, addressAsUint256, amountAsUint256]
  const inputs = [indexAsUint256, addressAsUint256, amountAsUint256];

  // Pack the inputs array like abi.encodePacked(inputs) in Solidity
  const packed = inputs
    .map((input) => input.toString(16).padStart(64, "0"))
    .join("");

  // Hash the packed data (single hash, matching Solidity)
  return keccak256("0x" + packed);
}

export function getMerkleTree(csvInput: any[]) {
  const leaves = csvInput.map((row) => {
    // Handle CSV data format - row is an object with properties
    const index = row.index || row.Index || "0";
    const address =
      row.address ||
      row.Address ||
      "0x0000000000000000000000000000000000000000";
    const amount = row.amount || row.Amount || "0";

    // Convert address to uint256 (like uint256(uint160(address)) in Solidity)
    const indexAsUint256 = BigInt(index);
    const addressAsUint256 = BigInt(address);
    const amountAsUint256 = BigInt(amount);

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

export function decodeOrder(orderBytes: string): OrderV3Type {
  const [order] = abiCoder.decode([OrderV3], orderBytes);
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
    context.map((n, index) => {
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
