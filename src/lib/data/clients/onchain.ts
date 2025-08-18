import { readContract } from "@wagmi/core";
import { wagmiConfig } from "svelte-wagmi";
import { get } from "svelte/store";
import type { Hex } from "viem";

// Minimal on-chain helper; can be extended to multicall later if desired
export async function getMaxSharesSupplyMap(
  authorizerAddresses: Array<Hex>,
  authorizerAbi: any
): Promise<Record<string, string>> {
  const cfg = get(wagmiConfig);

  const results: Record<string, string> = {};
  for (const addr of authorizerAddresses) {
    try {
      const value = (await readContract(cfg, {
        abi: authorizerAbi,
        address: addr,
        functionName: "maxSharesSupply",
        args: []
      })) as bigint;
      results[(addr as string).toLowerCase()] = value.toString();
    } catch {
      // Default to 0 if read fails
      results[(addr as string).toLowerCase()] = "0";
    }
  }
  return results;
}

