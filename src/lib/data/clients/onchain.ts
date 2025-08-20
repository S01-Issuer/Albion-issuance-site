import { readContract, multicall } from "@wagmi/core";
import { wagmiConfig } from "svelte-wagmi";
import { get } from "svelte/store";
import type { Hex } from "viem";

// Use multicall to batch read max supply from authorizer contracts efficiently
export async function getMaxSharesSupplyMap(
  authorizerAddresses: Array<Hex>,
  authorizerAbi: any
): Promise<Record<string, string>> {
  const cfg = get(wagmiConfig);
  
  if (authorizerAddresses.length === 0) {
    console.log('[onchain] No authorizer addresses to query');
    return {};
  }

  console.log(`[onchain] Preparing multicall for ${authorizerAddresses.length} authorizers`);
  
  // Prepare multicall contracts array for maxSharesSupply
  const contracts = authorizerAddresses.map(addr => ({
    address: addr,
    abi: authorizerAbi,
    functionName: "maxSharesSupply",
    args: []
  }));

  try {
    console.log('[onchain] Executing multicall RPC request...');
    
    // Use wagmi's multicall - it has built-in fallback transport with retry
    const results = await multicall(cfg, {
      contracts,
      allowFailure: true // Allow individual calls to fail
    });
    console.log('[onchain] Multicall RPC request completed');

    const resultMap: Record<string, string> = {};
    
    for (let i = 0; i < authorizerAddresses.length; i++) {
      const addr = authorizerAddresses[i];
      const result = results[i];
      
      if (result.status === 'success' && result.result) {
        resultMap[addr.toLowerCase()] = result.result.toString();
      } else {
        // Some authorizers might not have maxSharesSupply
        // Don't set a value - let the calling code use totalShares as fallback
        console.warn(`Authorizer ${addr} doesn't have maxSharesSupply or it reverted`);
      }
    }
    
    return resultMap;
  } catch (error) {
    console.error('Multicall failed:', error);
    return {};
  }
}

