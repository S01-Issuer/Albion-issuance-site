import {
  claimsRepository,
  type OrderDetail,
} from "$lib/data/repositories/claimsRepository";
import {
  ENERGY_FIELDS,
  ORDERBOOK_CONTRACT_ADDRESS,
  type Claim,
} from "$lib/network";
import {
  fetchAndValidateCSV,
  getMerkleTree,
  getLeaf,
  getProofForLeaf,
  decodeOrder,
  signContext,
  sortClaimsData,
  fetchLogs,
  HYPERSYNC_URL,
  CONTEXT_EVENT_TOPIC,
  type ClaimHistory,
  type CsvClaimRow,
  type HypersyncResult,
} from "$lib/utils/claims";
import { formatEther, parseEther, type Hex } from "viem";
import { wagmiConfig } from "svelte-wagmi";
import { simulateContract, writeContract } from "@wagmi/core";
import { get } from "svelte/store";
import orderbookAbi from "$lib/abi/orderbook.json";

export class ClaimsCsvLoadError extends Error {
  readonly code = "CLAIMS_CSV_LOAD_ERROR";

  constructor(message = "Unable to load claims CSV data") {
    super(message);
    this.name = "ClaimsCsvLoadError";
  }
}

type SortClaimsBase = Awaited<ReturnType<typeof sortClaimsData>>;
type SortedClaimsData = SortClaimsBase & {
  holdings: HoldingRow[];
  totalClaimedAmount?: string | number | bigint;
  totalEarned?: string | number | bigint;
  totalUnclaimedAmount?: string | number | bigint;
};

interface HoldingRow {
  id: string;
  unclaimedAmount: number | string;
  [key: string]: unknown;
}

type SignedContext = ReturnType<typeof signContext>;

interface HoldingWithProof extends HoldingRow {
  order: ReturnType<typeof decodeOrder>;
  signedContext: SignedContext;
  orderBookAddress: string;
}

interface PendingClaim {
  holdings: HoldingWithProof[];
  claims: ClaimHistory[];
  totalClaimed: number;
  totalEarned: number;
  totalUnclaimed: number;
}

export interface ClaimsHoldingsGroup {
  fieldName: string;
  tokenAddress: string;
  symbol: string;
  totalAmount: number;
  holdings: HoldingWithProof[];
}

export interface ClaimsResult {
  holdings: ClaimsHoldingsGroup[];
  claimHistory: ClaimHistory[];
  totals: {
    earned: number;
    claimed: number;
    unclaimed: number;
  };
  hasCsvLoadError: boolean;
}

export class ClaimsService {
  private csvCache = new Map<string, CsvClaimRow[]>();
  private repository = claimsRepository;

  /**
   * Fetch and cache CSV data
   */
  private async fetchCsv(
    csvLink: string,
    expectedMerkleRoot: string,
    expectedContentHash: string,
  ): Promise<CsvClaimRow[] | null> {
    const cached = this.csvCache.get(csvLink);
    if (cached) {
      return cached;
    }

    const data = await fetchAndValidateCSV(
      csvLink,
      expectedMerkleRoot,
      expectedContentHash,
    );
    if (data) {
      this.csvCache.set(csvLink, data);
    }
    return data;
  }

  /**
   * Process claims in batches to avoid rate limiting
   */
  private async processBatch<T>(
    items: Array<() => Promise<T>>,
    batchSize = 2,
    delayBetweenBatches = 300,
  ): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
      results.push(...batchResults);

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return results;
  }

  /**
   * Load all claims data for a wallet address
   */
  async loadClaimsForWallet(ownerAddress: string): Promise<ClaimsResult> {
    if (!ownerAddress) {
      return {
        holdings: [],
        claimHistory: [],
        totals: { earned: 0, claimed: 0, unclaimed: 0 },
        hasCsvLoadError: false,
      };
    }

    // Collect all claims and their metadata
    const claimMetadata: {
      fieldName: string;
      tokenAddress: string;
      symbol: string;
      claim: Claim;
    }[] = [];

    for (const field of ENERGY_FIELDS) {
      for (const token of field.sftTokens) {
        if (!token.claims || token.claims.length === 0) continue;
        for (const claim of token.claims as Claim[]) {
          claimMetadata.push({
            fieldName: field.name,
            tokenAddress: token.address,
            symbol: token.symbol,
            claim,
          });
        }
      }
    }

    if (claimMetadata.length === 0) {
      return {
        holdings: [],
        claimHistory: [],
        totals: { earned: 0, claimed: 0, unclaimed: 0 },
        hasCsvLoadError: false,
      };
    }

    // Phase 1: Pre-fetch all orders in a single batch query (instead of 12+ individual queries)
    const allOrderHashes = claimMetadata.map((m) => m.claim.orderHash);
    const allOrders = await this.repository.getOrdersByHashes(allOrderHashes);

    // Index orders by hash for O(1) lookup
    const ordersByHash = new Map<string, OrderDetail>();
    for (const order of allOrders) {
      ordersByHash.set(order.orderHash.toLowerCase(), order);
    }

    // Phase 2: Determine earliest block across all orders for a single Hypersync scan
    let earliestBlock = Infinity;
    for (const order of allOrders) {
      const blockNum = order.addEvents?.[0]?.transaction?.blockNumber;
      if (blockNum) {
        const parsed = parseInt(blockNum);
        if (parsed < earliestBlock) earliestBlock = parsed;
      }
    }

    // Phase 3: Fetch Hypersync logs ONCE from earliest block (instead of 12+ separate scans)
    const sharedLogs: HypersyncResult[] =
      earliestBlock < Infinity
        ? await fetchLogs(
            HYPERSYNC_URL,
            ORDERBOOK_CONTRACT_ADDRESS,
            CONTEXT_EVENT_TOPIC,
            earliestBlock,
          )
        : [];

    // Phase 4: Process each claim using pre-fetched data
    let claimHistory: ClaimHistory[] = [];
    const holdings: ClaimsHoldingsGroup[] = [];
    let totalClaimed = 0;
    let totalEarned = 0;
    let totalUnclaimed = 0;
    let csvLoadFailed = false;

    const claimProcessors = claimMetadata.map(
      ({ fieldName, tokenAddress, symbol, claim }) =>
        () =>
          this.processClaimForWallet(
            claim,
            ownerAddress,
            fieldName,
            tokenAddress,
            symbol,
            ordersByHash,
            sharedLogs,
          ),
    );

    // Process claims in batches (6 at a time with 100ms delay between batches)
    const results = await this.processBatch(claimProcessors, 6, 100);

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];

      if (result.status === "rejected") {
        console.error("Error processing claim:", result.reason);
        csvLoadFailed = true;
        continue;
      }

      const claimData = result.value;
      if (!claimData) continue;

      const { fieldName, tokenAddress, symbol } = claimMetadata[index];

      claimHistory = [...claimHistory, ...claimData.claims];

      this.mergeHoldingsGroup(
        holdings,
        fieldName,
        tokenAddress,
        symbol,
        claimData.holdings,
      );

      totalClaimed += claimData.totalClaimed;
      totalEarned += claimData.totalEarned;
      totalUnclaimed += claimData.totalUnclaimed;
    }

    return {
      holdings,
      claimHistory,
      totals: {
        earned: totalEarned,
        claimed: totalClaimed,
        unclaimed: totalUnclaimed,
      },
      hasCsvLoadError: csvLoadFailed,
    };
  }

  /**
   * Process a single claim for a wallet using pre-fetched order data and Hypersync logs
   */
  private async processClaimForWallet(
    claim: Claim,
    ownerAddress: string,
    fieldName: string,
    tokenAddress: string,
    symbol: string,
    ordersByHash: Map<string, OrderDetail>,
    sharedLogs: HypersyncResult[],
  ): Promise<PendingClaim | null> {
    if (!claim.csvLink) return null;

    // Look up pre-fetched order (no network call needed)
    const orderDetail = ordersByHash.get(claim.orderHash.toLowerCase());
    if (!orderDetail) return null;

    // Fetch CSV data and trades in parallel (order is already available)
    const [csvData, trades] = await Promise.all([
      this.fetchCsv(
        claim.csvLink,
        claim.expectedMerkleRoot,
        claim.expectedContentHash,
      ),
      this.repository.getTradesForClaims(claim.orderHash, ownerAddress),
    ]);

    if (!csvData) {
      throw new ClaimsCsvLoadError();
    }

    const orderBookAddress = orderDetail.orderbook.id;
    const decodedOrder = decodeOrder(orderDetail.orderBytes);

    const orderStartBlock = orderDetail.addEvents?.[0]?.transaction
      ?.blockNumber
      ? parseInt(orderDetail.addEvents[0].transaction.blockNumber)
      : undefined;

    // Build merkle tree and process claims (using shared pre-fetched Hypersync logs)
    const merkleTree = getMerkleTree(csvData);
    const sortedClaimsData = (await sortClaimsData(
      csvData,
      trades,
      ownerAddress,
      fieldName,
      undefined,
      tokenAddress,
      claim.orderHash,
      symbol,
      orderStartBlock,
      sharedLogs, // Pass shared logs to avoid per-claim Hypersync scan
    )) as SortedClaimsData;

    // Generate proofs for holdings
    const holdingsWithProofs: HoldingWithProof[] =
      sortedClaimsData.holdings.map((h) => {
        const leaf = getLeaf(h.id, ownerAddress, h.unclaimedAmount);
        const proofForLeaf = getProofForLeaf(merkleTree, leaf);
        const holdingSignedContext = signContext(
          [
            h.id,
            parseEther(h.unclaimedAmount.toString()),
            ...proofForLeaf.proof,
          ].map((i) => BigInt(i)),
        );

        return {
          ...h,
          order: decodedOrder,
          signedContext: holdingSignedContext,
          orderBookAddress,
        };
      });

    return {
      holdings: holdingsWithProofs,
      claims: sortedClaimsData.claims,
      totalClaimed: sortedClaimsData?.totalClaimedAmount
        ? Number(formatEther(BigInt(sortedClaimsData.totalClaimedAmount)))
        : 0,
      totalEarned: sortedClaimsData?.totalEarned
        ? Number(formatEther(BigInt(sortedClaimsData.totalEarned)))
        : 0,
      totalUnclaimed: sortedClaimsData?.totalUnclaimedAmount
        ? Number(formatEther(BigInt(sortedClaimsData.totalUnclaimedAmount)))
        : 0,
    };
  }

  /**
   * Merge holdings into grouped structure by token address
   */
  private mergeHoldingsGroup(
    groups: ClaimsHoldingsGroup[],
    fieldName: string,
    tokenAddress: string,
    symbol: string,
    newHoldings: HoldingWithProof[],
  ): void {
    // Group by token address (each SFT token has its own claims)
    const normalizedAddress = tokenAddress.toLowerCase();
    const existing = groups.find(
      (g) => g.tokenAddress.toLowerCase() === normalizedAddress,
    );

    if (existing) {
      existing.holdings = [...existing.holdings, ...newHoldings];
      existing.totalAmount = existing.holdings.reduce(
        (sum, h) => sum + Number(h.unclaimedAmount),
        0,
      );
    } else {
      const totalAmount = newHoldings.reduce(
        (sum, h) => sum + Number(h.unclaimedAmount),
        0,
      );
      groups.push({
        fieldName,
        tokenAddress,
        symbol,
        totalAmount,
        holdings: newHoldings,
      });
    }
  }

  /**
   * Claim all available holdings
   */
  async claimAll(holdings: ClaimsHoldingsGroup[]): Promise<void> {
    if (!holdings || holdings.length === 0) {
      throw new Error("No holdings to claim");
    }

    const cfg = get(wagmiConfig);
    const allOrders: Array<{
      order: ReturnType<typeof decodeOrder>;
      inputIOIndex: number;
      outputIOIndex: number;
      signedContext: readonly SignedContext[];
    }> = [];
    let orderBookAddress: Hex | undefined;

    // Prepare all orders for claiming
    for (const group of holdings) {
      for (const h of group.holdings) {
        orderBookAddress = (h.orderBookAddress as Hex) || orderBookAddress;
        allOrders.push({
          order: h.order,
          inputIOIndex: 0,
          outputIOIndex: 0,
          signedContext: [h.signedContext],
        });
      }
    }

    if (!orderBookAddress) {
      throw new Error("No orderbook address found");
    }

    // Prepare transaction config
    const takeOrdersConfig = {
      minimumInput: 0n,
      maximumInput: 2n ** 256n - 1n,
      maximumIORatio: 2n ** 256n - 1n,
      orders: allOrders,
      data: "0x",
    } as const;

    // Simulate and execute transaction
    const { request } = await simulateContract(cfg, {
      abi: orderbookAbi,
      address: orderBookAddress,
      functionName: "takeOrders2",
      args: [takeOrdersConfig],
    });

    await writeContract(cfg, request);
  }

  /**
   * Clear cached CSV data
   */
  clearCache(): void {
    this.csvCache.clear();
  }
}

export const claimsService = new ClaimsService();
