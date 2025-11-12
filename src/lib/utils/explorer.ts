import { base, sepolia } from '@wagmi/core/chains';

/**
 * Map of chain IDs to their block explorer base URLs
 */
const explorerUrls: Record<number, string> = {
	[base.id]: 'https://basescan.org',
	[sepolia.id]: 'https://sepolia.etherscan.io',
};

/**
 * Get the block explorer URL for a given chain ID
 * @param chainId - The chain ID (defaults to Base mainnet)
 * @returns The base URL of the block explorer for the chain
 */
export function getExplorerUrl(chainId: number = base.id): string {
	return explorerUrls[chainId] || explorerUrls[base.id];
}

/**
 * Get the transaction URL for a given chain and transaction hash
 * @param txHash - The transaction hash
 * @param chainId - The chain ID (defaults to Base mainnet)
 * @returns The full transaction URL on the block explorer
 */
export function getTxUrl(txHash: string, chainId: number = base.id): string {
	return `${getExplorerUrl(chainId)}/tx/${txHash}`;
}

/**
 * Get the address URL for a given chain and address
 * @param address - The blockchain address
 * @param chainId - The chain ID (defaults to Base mainnet)
 * @returns The full address URL on the block explorer
 */
export function getAddressUrl(address: string, chainId: number = base.id): string {
	return `${getExplorerUrl(chainId)}/address/${address}`;
}
