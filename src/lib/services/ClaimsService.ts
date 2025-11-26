import { claimsRepository } from "$lib/data/repositories/claimsRepository";
import { ENERGY_FIELDS, type Claim } from "$lib/network";
import {
  fetchAndValidateCSV,
  getMerkleTree,
  getLeaf,
  getProofForLeaf,
  decodeOrder,
  signContext,
  sortClaimsData,
  type ClaimHistory,
  type CsvClaimRow,
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

    let claimHistory: ClaimHistory[] = [];
    const holdings: ClaimsHoldingsGroup[] = [];
    let totalClaimed = 0;
    let totalEarned = 0;
    let totalUnclaimed = 0;
    let csvLoadFailed = false;

    // Collect all claim processing promises for parallel execution
    const claimPromises: Array<Promise<PendingClaim | null>> = [];
    const claimMetadata: { fieldName: string; tokenAddress: string; claim: Claim }[] = [];

    // Build list of all claims to process
    for (const field of ENERGY_FIELDS) {
      for (const token of field.sftTokens) {
        if (!token.claims || token.claims.length === 0) continue;

        for (const claim of token.claims as Claim[]) {
          claimMetadata.push({ fieldName: field.name, tokenAddress: token.address, claim });
          claimPromises.push(
            this.processClaimForWallet(claim, ownerAddress, field.name, token.address),
          );
        }
      }
    }

    // Process all claims in parallel
    const results = await Promise.allSettled(claimPromises);

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];

      if (result.status === "rejected") {
        // Log the error and set the flag - don't throw to allow partial results
        console.error("Error processing claim:", result.reason);
        csvLoadFailed = true;
        continue;
      }

      const claimData = result.value;
      if (!claimData) continue;

      const { fieldName, tokenAddress } = claimMetadata[index];

      // Merge results
      claimHistory = [...claimHistory, ...claimData.claims];

      // Group holdings by token address (each token has its own claims)
      this.mergeHoldingsGroup(holdings, fieldName, tokenAddress, claimData.holdings);

      // Update totals
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
   * Process a single claim for a wallet
   */
  private async processClaimForWallet(
    claim: Claim,
    ownerAddress: string,
    fieldName: string,
    tokenAddress: string,
  ): Promise<PendingClaim | null> {
    if (!claim.csvLink) return null;

    // Fetch CSV data, trades and order details in parallel
    const [csvData, trades, orderDetails] = await Promise.all([
      this.fetchCsv(
        claim.csvLink,
        claim.expectedMerkleRoot,
        claim.expectedContentHash,
      ),
      this.repository.getTradesForClaims(claim.orderHash, ownerAddress),
      this.repository.getOrderByHash(claim.orderHash),
    ]);

    if (!csvData) {
      throw new ClaimsCsvLoadError();
    }
    if (!orderDetails || orderDetails.length === 0) return null;

    const orderBookAddress = orderDetails[0].orderbook.id;
    const decodedOrder = decodeOrder(orderDetails[0].orderBytes);

    // Build merkle tree and process claims
    const merkleTree = getMerkleTree(csvData);
    const sortedClaimsData = (await sortClaimsData(
      csvData,
      trades,
      ownerAddress,
      fieldName,
      undefined,
      tokenAddress,
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
    newHoldings: HoldingWithProof[],
  ): void {
    // Group by token address (each SFT token has its own claims)
    const normalizedAddress = tokenAddress.toLowerCase();
    const existing = groups.find((g) => g.tokenAddress.toLowerCase() === normalizedAddress);

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
