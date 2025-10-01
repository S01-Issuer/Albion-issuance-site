import { getAddress } from 'viem';

export function getTokenTermsPath(contractAddress?: string | null): string | null {
	if (!contractAddress) return null;
	const trimmed = contractAddress.trim();
	if (!trimmed) return null;

	try {
		const checksum = getAddress(trimmed);
		return `/token-terms/${checksum}`;
	} catch {
		// Fallback to lowercase for non-address identifiers.
		const normalized = trimmed.toLowerCase();
		return `/token-terms/${normalized}`;
	}
}
