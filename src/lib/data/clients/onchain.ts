import { multicall } from "@wagmi/core";
import { wagmiConfig } from "svelte-wagmi";
import { get } from "svelte/store";
import type { Abi, Hex } from "viem";
import { erc20Abi } from "viem";

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

/**
 * Query ERC20 token balances directly from the blockchain using multicall.
 * This is a fallback for when subgraph data is stale or missing.
 *
 * @param tokenAddresses - Array of token contract addresses
 * @param ownerAddress - The wallet address to check balances for
 * @returns Record mapping token address (lowercase) to balance as bigint string
 */
export async function getTokenBalancesOnchain(
  tokenAddresses: Array<Hex>,
  ownerAddress: Hex,
): Promise<Record<string, string>> {
  if (typeof window === "undefined") {
    log("Skipping balance query - server-side rendering");
    return {};
  }

  const cfg = get(wagmiConfig);

  if (!cfg || !cfg.getClient) {
    log("Wagmi config not initialized yet");
    return {};
  }

  if (tokenAddresses.length === 0 || !ownerAddress) {
    log("No token addresses or owner address to query");
    return {};
  }

  log(
    `Querying balances for ${tokenAddresses.length} tokens for owner ${ownerAddress}`,
  );

  const contracts = tokenAddresses.map((addr) => ({
    address: addr,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [ownerAddress],
  }));

  try {
    const results = await multicall(cfg, {
      contracts,
      allowFailure: true,
    });

    const balanceMap: Record<string, string> = {};

    for (let i = 0; i < tokenAddresses.length; i++) {
      const addr = tokenAddresses[i];
      const result = results[i];

      if (result.status === "success" && result.result !== undefined) {
        balanceMap[addr.toLowerCase()] = result.result.toString();
      } else {
        log(`Failed to get balance for token ${addr}`);
        balanceMap[addr.toLowerCase()] = "0";
      }
    }

    log("Balance query completed:", balanceMap);
    return balanceMap;
  } catch (error) {
    console.error("Balance multicall failed:", error);
    return {};
  }
}
