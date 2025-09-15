import { derived, writable } from "svelte/store";
import { chainId, signerAddress } from "svelte-wagmi";
import { type Chain } from "@wagmi/core/chains";
import { base } from "@wagmi/core/chains";
import type { MetaV1S, OffchainAssetReceiptVault } from "$lib/types/graphql";

export const sftMetadata = writable<MetaV1S[] | null>(null);
export const targetNetwork = writable<Chain>(base);
export const wrongNetwork = derived(
  [chainId, signerAddress, targetNetwork],
  ([$chainId, $signerAddress, $targetNetwork]) =>
    $signerAddress && $chainId !== $targetNetwork.id,
);

// Initialize as null instead of empty array to indicate "not loaded yet"
export const sfts = writable<OffchainAssetReceiptVault[] | null>(null);

// Add a derived store to track if data is actually loaded
export const dataLoaded = derived(
  [sfts, sftMetadata],
  ([$sfts, $sftMetadata]) => {
    // Both must be arrays with at least some data
    return (
      Array.isArray($sfts) &&
      $sfts.length > 0 &&
      Array.isArray($sftMetadata) &&
      $sftMetadata.length > 0
    );
  },
);
