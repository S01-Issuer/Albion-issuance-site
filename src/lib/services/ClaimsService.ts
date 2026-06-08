import {
  claimsRepository,
  type OrderDetail,
} from "$lib/data/repositories/claimsRepository";
import {
  ENERGY_FIELDS,
  ORDERBOOK_SOURCES,
  ORDERBOOK_V6_CONTRACT_ADDRESS,
  getContextEventTopics,
  getOrderbookSource,
  type Claim,
  type OrderbookSource,
} from "$lib/network";
import {
  fetchAndValidateCSV,
  getMerkleTree,
  getLeaf,
  getProofForLeaf,
  decodeOrder,
  buildClaimSignedContext,
  type SignedContextV1Type,
  sortClaimsData,
  fetchLogs,
  getStoredClaimTransactionHashes,
  HYPERSYNC_URL,
  type AmountEncoding,
  type ClaimHistory,
  type CsvClaimRow,
  type HypersyncResult,
} from "$lib/utils/claims";
import { formatEther, type Hex } from "viem";
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

type SignedContext = SignedContextV1Type;

interface HoldingWithProof extends HoldingRow {
  order: ReturnType<typeof decodeOrder>;
  signedContext: SignedContext;
  orderBookAddress: string;
  orderHash: string;
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
    encoding: AmountEncoding = "int18",
  ): Promise<CsvClaimRow[] | null> {
    const cached = this.csvCache.get(csvLink);
    if (cached) {
      return cached;
    }

    const data = await fetchAndValidateCSV(
      csvLink,
      expectedMerkleRoot,
      expectedContentHash,
      encoding,
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
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatches),
        );
      }
    }

    return results;
  }

  /**
   * Load all claims data for a wallet address
   */
  async loadClaimsForWallet(
    ownerAddress: string,
    options?: {
      refreshContextEvents?: boolean;
      /** Recent claim tx hashes for receipt-log fallback (e.g. after a successful claim). */
      claimTxHashes?: string[];
    },
  ): Promise<ClaimsResult> {
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

    // Phase 1: Resolve order details. Claims that carry a static order (orderBytes +
    // deployBlock — the v6 subgraph-free path) are resolved locally; only the rest
    // (v4 legacy) are batch-queried from the subgraph.
    const ordersByHash = new Map<string, OrderDetail>();
    const hashesNeedingSubgraph: string[] = [];
    for (const { claim } of claimMetadata) {
      if (claim.orderBytes && claim.deployBlock !== undefined) {
        ordersByHash.set(claim.orderHash.toLowerCase(), {
          orderBytes: claim.orderBytes,
          orderHash: claim.orderHash,
          // Static orders are v6-era (only v6 deploys capture orderBytes).
          orderbook: { id: ORDERBOOK_V6_CONTRACT_ADDRESS.toLowerCase() },
          addEvents: [
            {
              transaction: {
                id: "",
                timestamp: "",
                blockNumber: String(claim.deployBlock),
              },
            },
          ],
        });
      } else {
        hashesNeedingSubgraph.push(claim.orderHash);
      }
    }
    if (hashesNeedingSubgraph.length > 0) {
      const fetched = await this.repository.getOrdersByHashes(
        hashesNeedingSubgraph,
      );
      for (const order of fetched) {
        const key = order.orderHash.toLowerCase();
        const existing = ordersByHash.get(key);
        if (
          !existing ||
          (order.orderBytes?.length ?? 0) > (existing.orderBytes?.length ?? 0)
        ) {
          ordersByHash.set(key, order);
        }
      }
    }

    const storedClaimTxHashes = [
      ...new Set([
        ...getStoredClaimTransactionHashes(),
        ...(options?.claimTxHashes ?? []),
      ]),
    ];
    const allOrders = [...ordersByHash.values()];

    // Phase 2+3: Fetch Context logs PER OrderBook era. v4 and v6 have different
    // contract addresses, event topics, and amount encodings, so each era is scanned
    // separately (once, from its earliest order block) and keyed by OrderBook address.
    const earliestByOb = new Map<string, number>();
    for (const order of allOrders) {
      const ob = order.orderbook?.id?.toLowerCase();
      const blockNum = order.addEvents?.[0]?.transaction?.blockNumber;
      if (!ob || !blockNum) continue;
      const parsed = parseInt(blockNum);
      const prev = earliestByOb.get(ob);
      if (prev === undefined || parsed < prev) earliestByOb.set(ob, parsed);
    }

    const logsByOb = new Map<string, HypersyncResult[]>();
    await Promise.all(
      ORDERBOOK_SOURCES.map(async (src) => {
        const ob = src.address.toLowerCase();
        const earliest = earliestByOb.get(ob);
        if (earliest === undefined) return;
        const logs = await fetchLogs(
          HYPERSYNC_URL,
          src.address,
          getContextEventTopics(src),
          earliest,
          options?.refreshContextEvents ?? false,
        );
        logsByOb.set(ob, logs);
      }),
    );

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
            logsByOb,
            storedClaimTxHashes,
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
    logsByOb: Map<string, HypersyncResult[]>,
    claimTxHashes: string[] = [],
  ): Promise<PendingClaim | null> {
    if (!claim.csvLink) return null;

    // Look up pre-fetched order (no network call needed)
    const orderDetail = ordersByHash.get(claim.orderHash.toLowerCase());
    if (!orderDetail) return null;

    // Determine which OrderBook era this order lives on (v4 int18 / v6 Float).
    // Resolved BEFORE the CSV fetch: the merkle-root integrity check is era-
    // specific, so the CSV must be validated with this order's amount encoding
    // (v6 against the Float root, v4 against the int18 root).
    const orderBookAddress = orderDetail.orderbook?.id?.toLowerCase();
    if (!orderBookAddress) {
      return null;
    }
    const source: OrderbookSource | undefined =
      getOrderbookSource(orderBookAddress);
    const encoding = source?.amountEncoding ?? "int18";
    const version = source?.version ?? "v4";
    const isClaimable = source?.claimable ?? true;

    // Fetch CSV data (order is already available). Claimed-state AND history both
    // come from the shared per-OB Context scan (sharedLogs) below, so no per-order
    // `trades` subgraph query is needed — the Context log carries its own txHash +
    // block timestamp.
    const csvData = await this.fetchCsv(
      claim.csvLink,
      claim.expectedMerkleRoot,
      claim.expectedContentHash,
      encoding,
    );

    if (!csvData) {
      throw new ClaimsCsvLoadError();
    }

    const sharedLogs = logsByOb.get(orderBookAddress.toLowerCase()) ?? [];

    const decodedOrder = decodeOrder(orderDetail.orderBytes, version);

    const orderStartBlock = orderDetail.addEvents?.[0]?.transaction?.blockNumber
      ? parseInt(orderDetail.addEvents[0].transaction.blockNumber)
      : undefined;

    // Build merkle tree and process claims (using shared per-era Hypersync logs)
    const merkleTree = getMerkleTree(csvData, encoding);
    const sortedClaimsData = (await sortClaimsData(
      csvData,
      [], // claimed-state + history come from per-era Context logs (not trades)
      ownerAddress,
      fieldName,
      undefined,
      tokenAddress,
      claim.orderHash,
      symbol,
      orderStartBlock,
      sharedLogs,
      source,
      claimTxHashes,
      claim.expectedMerkleRoot,
    )) as SortedClaimsData;

    const claimedAmount = sortedClaimsData?.totalClaimedAmount
      ? Number(formatEther(BigInt(sortedClaimsData.totalClaimedAmount)))
      : 0;

    // Legacy (history-only) era: count already-claimed toward earnings/history, but
    // offer NOTHING claimable and add nothing to unclaimed — its outstanding funds
    // were migrated to the active OrderBook, so counting them here would double-count.
    if (!isClaimable) {
      return {
        holdings: [],
        claims: sortedClaimsData.claims,
        totalClaimed: claimedAmount,
        totalEarned: claimedAmount,
        totalUnclaimed: 0,
      };
    }

    // Generate proofs for holdings (active era)
    const holdingsWithProofs: HoldingWithProof[] = sortedClaimsData.holdings
      .map((h) => {
        const amountWei = h.amountWei ?? h.unclaimedAmount;
        const leaf = getLeaf(h.id, ownerAddress, amountWei, encoding);
        const proofForLeaf = getProofForLeaf(merkleTree, leaf);

        const holdingSignedContext = buildClaimSignedContext(
          h.id,
          amountWei,
          proofForLeaf.proof,
          encoding,
        );

        return {
          ...h,
          order: decodedOrder,
          signedContext: holdingSignedContext,
          orderBookAddress,
          orderHash: claim.orderHash,
        };
      })
      .filter((h) => h.order && h.signedContext && h.orderBookAddress);

    return {
      holdings: holdingsWithProofs,
      claims: sortedClaimsData.claims,
      totalClaimed: claimedAmount,
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
