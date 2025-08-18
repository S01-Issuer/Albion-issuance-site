import { getTradesForClaims, getOrderByHash } from "$lib/data/repositories/claimsRepository";
import { ENERGY_FIELDS, type Claim } from "$lib/network";
import {
  fetchAndValidateCSV,
  getMerkleTree,
  getLeaf,
  getProofForLeaf,
  decodeOrder,
  signContext,
  sortClaimsData,
  type ClaimHistory
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

  private async fetchCsv(csvLink: string, expectedMerkleRoot: string, expectedContentHash: string): Promise<any[] | null> {
    if (this.csvCache.has(csvLink)) return this.csvCache.get(csvLink)!;
    const data = await fetchAndValidateCSV(csvLink, expectedMerkleRoot, expectedContentHash);
    if (data) this.csvCache.set(csvLink, data);
    return data;
  }

  async loadClaimsForWallet(ownerAddress: string): Promise<ClaimsResult> {
    let claimHistory: ClaimHistory[] = [];
    let holdings: ClaimsHoldingsGroup[] = [];
    let totalClaimed = 0;
    let totalEarned = 0;
    let totalUnclaimed = 0;

    // Fetch all CSVs (sequential per token for simplicity; can be parallelized later)
    for (const field of ENERGY_FIELDS) {
      for (const token of field.sftTokens) {
        if (!token.claims || token.claims.length === 0) continue;

        for (const claim of token.claims as Claim[]) {
          if (!claim.csvLink) continue;
          const csvData = await this.fetchCsv(claim.csvLink, claim.expectedMerkleRoot, claim.expectedContentHash);
          if (!csvData) continue;

          const merkleTree = getMerkleTree(csvData);
          const trades = await getTradesForClaims(claim.orderHash, ownerAddress);
          const orderDetails = await getOrderByHash(claim.orderHash);
          if (!orderDetails || orderDetails.length === 0) continue;
          const orderBookAddress = orderDetails[0].orderbook.id;
          const decodedOrder = decodeOrder(orderDetails[0].orderBytes);

          const sortedClaimsData = await sortClaimsData(csvData, trades, ownerAddress, field.name);
          const holdingsWithProofs = sortedClaimsData.holdings.map((h: any) => {
            const leaf = getLeaf(h.id, ownerAddress || '', h.unclaimedAmount);
            const proofForLeaf = getProofForLeaf(merkleTree, leaf);
            const holdingSignedContext = signContext([
              h.id,
              parseEther(h.unclaimedAmount.toString()),
              ...proofForLeaf.proof
            ].map((i) => BigInt(i)));
            return {
              ...h,
              order: decodedOrder,
              signedContext: holdingSignedContext,
              orderBookAddress
            };
          });

          claimHistory = [...claimHistory, ...sortedClaimsData.claims];

          // Group by field name
          const existing = holdings.find((g) => g.fieldName === field.name);
          const groupAmount = holdingsWithProofs.reduce((sum: number, h: any) => sum + Number(h.unclaimedAmount), 0);
          if (existing) {
            existing.holdings = [...existing.holdings, ...holdingsWithProofs];
            existing.totalAmount = existing.holdings.reduce((sum, h) => sum + Number(h.unclaimedAmount), 0);
          } else {
            holdings.push({ fieldName: field.name, totalAmount: groupAmount, holdings: holdingsWithProofs });
          }

          if (sortedClaimsData?.totalClaimedAmount) totalClaimed += Number(formatEther(BigInt(sortedClaimsData.totalClaimedAmount)));
          if (sortedClaimsData?.totalEarned) totalEarned += Number(formatEther(BigInt(sortedClaimsData.totalEarned)));
          if (sortedClaimsData?.totalUnclaimedAmount) totalUnclaimed += Number(formatEther(BigInt(sortedClaimsData.totalUnclaimedAmount)));
        }
      }
    }

    return {
      holdings,
      claimHistory,
      totals: {
        earned: totalEarned,
        claimed: totalClaimed,
        unclaimed: totalUnclaimed
      }
    };
  }

  async claimAll(holdings: ClaimsHoldingsGroup[]): Promise<void> {
    const cfg = get(wagmiConfig);
    const allOrders = [] as any[];
    let orderBookAddress: Hex | undefined = undefined;
    for (const group of holdings) {
      for (const h of group.holdings) {
        orderBookAddress = (h.orderBookAddress as Hex) || orderBookAddress;
        allOrders.push({ order: h.order, inputIOIndex: 0, outputIOIndex: 0, signedContext: [h.signedContext] });
      }
    }
    if (!orderBookAddress) return;

    const takeOrdersConfig = {
      minimumInput: 0n,
      maximumInput: 2n ** 256n - 1n,
      maximumIORatio: 2n ** 256n - 1n,
      orders: allOrders,
      data: "0x"
    } as const;

    const { request } = await simulateContract(cfg, {
      abi: orderbookAbi,
      address: orderBookAddress,
      functionName: 'takeOrders2',
      args: [takeOrdersConfig]
    });

    await writeContract(cfg, request);
  }
}

export const claimsService = new ClaimsService();

