export function getTokenTermsPath(contractAddress?: string | null): string | null {
	if (!contractAddress) return null;
	const trimmed = contractAddress.trim();
	if (!trimmed) return null;
	const normalized = trimmed.toLowerCase();
	return `/token-terms/${normalized}`;
}
