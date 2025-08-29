import { derived, writable } from "svelte/store";
import { chainId, signerAddress } from "svelte-wagmi";
import { type Chain } from "@wagmi/core/chains";
import { base } from "@wagmi/core/chains";
import type { MetaV1S } from "$lib/types/sftMetadataTypes";
import type { OffchainAssetReceiptVault } from "$lib/types/offchainAssetReceiptVaultTypes";

export const sftMetadata = writable<MetaV1S[] | null>(null);
export const targetNetwork = writable<Chain>(base);
export const wrongNetwork = derived(
  [chainId, signerAddress, targetNetwork],
  ([$chainId, $signerAddress, $targetNetwork]) =>
    $signerAddress && $chainId !== $targetNetwork.id,
);

export const sfts = writable<OffchainAssetReceiptVault[]>([]);
