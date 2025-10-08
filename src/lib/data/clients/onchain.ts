import { multicall } from "@wagmi/core";
import { wagmiConfig } from "svelte-wagmi";
import { get } from "svelte/store";
import type { Abi, Hex } from "viem";

const isDev = import.meta.env?.DEV ?? false;

const log = (...messages: unknown[]) => {
  if (isDev) {
    console.warn("[onchain]", ...messages);
  }
};

// Use multicall to batch read max supply from authorizer contracts efficiently
export async function getMaxSharesSupplyMap(
  authorizerAddresses: Array<Hex>,
  authorizerAbi: Abi,
): Promise<Record<string, string>> {
  // Check if we're in a browser environment and wagmi is initialized
  if (typeof window === "undefined") {
    log("Skipping multicall - server-side rendering");
    return {};
  }

  const cfg = get(wagmiConfig);

  // Check if wagmi config is properly initialized
  if (!cfg || !cfg.getClient) {
    log("Wagmi config not initialized yet");
    return {};
  }

  if (authorizerAddresses.length === 0) {
    log("No authorizer addresses to query");
    return {};
  }

  log(`Preparing multicall for ${authorizerAddresses.length} authorizers`);

  // Prepare multicall contracts array for maxSharesSupply
  const contracts = authorizerAddresses.map((addr) => ({
    address: addr,
    abi: authorizerAbi,
    functionName: "maxSharesSupply",
    args: [],
  }));

  try {
    log("Executing multicall RPC request...");

    // Use wagmi's multicall - it has built-in fallback transport with retry
    const results = await multicall(cfg, {
      contracts,
      allowFailure: true, // Allow individual calls to fail
    });
    log("Multicall RPC request completed");

    const resultMap: Record<string, string> = {};

    for (let i = 0; i < authorizerAddresses.length; i++) {
      const addr = authorizerAddresses[i];
      const result = results[i];

      if (result.status === "success" && result.result) {
        resultMap[addr.toLowerCase()] = result.result.toString();
      } else {
        // Some authorizers might not have maxSharesSupply
        // Don't set a value - let the calling code use totalShares as fallback
        console.warn(
          `Authorizer ${addr} doesn't have maxSharesSupply or it reverted`,
        );
      }
    }

    return resultMap;
  } catch (error) {
    console.error("Multicall failed:", error);
    return {};
  }
}
