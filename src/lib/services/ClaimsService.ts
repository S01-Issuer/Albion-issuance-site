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
} from "$lib/utils/claims";
import { formatEther, parseEther, type Hex } from "viem";
import { wagmiConfig } from "svelte-wagmi";
import { simulateContract, writeContract } from "@wagmi/core";
import { get } from "svelte/store";
import orderbookAbi from "$lib/abi/orderbook.json";

export interface ClaimsHoldingsGroup {
  fieldName: string;
  totalAmount: number;
  holdings: any[];
}

export interface ClaimsResult {
  holdings: ClaimsHoldingsGroup[];
  claimHistory: ClaimHistory[];
  totals: {
    earned: number;
    claimed: number;
    unclaimed: number;
  };
}

export class ClaimsService {
  private csvCache = new Map<string, any[]>();
  private repository = claimsRepository;

  /**
   * Fetch and cache CSV data
   */
  private async fetchCsv(
    csvLink: string,
    expectedMerkleRoot: string,
    expectedContentHash: string,
  ): Promise<any[] | null> {
    if (this.csvCache.has(csvLink)) {
      return this.csvCache.get(csvLink)!;
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
      };
    }

    let claimHistory: ClaimHistory[] = [];
    const holdings: ClaimsHoldingsGroup[] = [];
    let totalClaimed = 0;
    let totalEarned = 0;
    let totalUnclaimed = 0;

    // Collect all claim processing promises for parallel execution
    const claimPromises: Promise<any>[] = [];
    const claimMetadata: { fieldName: string; claim: Claim }[] = [];

    // Build list of all claims to process
    for (const field of ENERGY_FIELDS) {
      for (const token of field.sftTokens) {
        if (!token.claims || token.claims.length === 0) continue;

        for (const claim of token.claims as Claim[]) {
          claimMetadata.push({ fieldName: field.name, claim });
          claimPromises.push(
            this.processClaimForWallet(claim, ownerAddress, field.name),
          );
        }
      }
    }

    // Process all claims in parallel
    const results = await Promise.all(claimPromises);

    // Merge results
    results.forEach((claimData, index) => {
      if (!claimData) return;

      const { fieldName } = claimMetadata[index];

      // Merge results
      claimHistory = [...claimHistory, ...claimData.claims];

      // Group holdings by field name
      this.mergeHoldingsGroup(holdings, fieldName, claimData.holdings);

      // Update totals
      totalClaimed += claimData.totalClaimed;
      totalEarned += claimData.totalEarned;
      totalUnclaimed += claimData.totalUnclaimed;
    });

    return {
      holdings,
      claimHistory,
      totals: {
        earned: totalEarned,
        claimed: totalClaimed,
        unclaimed: totalUnclaimed,
      },
    };
  }

  /**
   * Process a single claim for a wallet
   */
  private async processClaimForWallet(
    claim: Claim,
    ownerAddress: string,
    fieldName: string,
  ) {
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

    if (!csvData) return null;
    if (!orderDetails || orderDetails.length === 0) return null;

    const orderBookAddress = orderDetails[0].orderbook.id;
    const decodedOrder = decodeOrder(orderDetails[0].orderBytes);

    // Build merkle tree and process claims
    const merkleTree = getMerkleTree(csvData);
    const sortedClaimsData = await sortClaimsData(
      csvData,
      trades,
      ownerAddress,
      fieldName,
    );

    // Generate proofs for holdings
    const holdingsWithProofs = sortedClaimsData.holdings.map((h: any) => {
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
   * Merge holdings into grouped structure
   */
  private mergeHoldingsGroup(
    groups: ClaimsHoldingsGroup[],
    fieldName: string,
    newHoldings: any[],
  ): void {
    const existing = groups.find((g) => g.fieldName === fieldName);

    if (existing) {
      existing.holdings = [...existing.holdings, ...newHoldings];
      existing.totalAmount = existing.holdings.reduce(
        (sum, h) => sum + Number(h.unclaimedAmount),
        0,
      );
    } else {
      const totalAmount = newHoldings.reduce(
        (sum: number, h: any) => sum + Number(h.unclaimedAmount),
        0,
      );
      groups.push({
        fieldName,
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
    const allOrders = [] as any[];
    let orderBookAddress: Hex | undefined = undefined;

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
