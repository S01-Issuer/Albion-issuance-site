import { PINATA_GATEWAY } from "$lib/network";

// Basic CID pattern: allow common prefixes (bafy..., bafk..., Qm...)
function looksLikeCid(input: string): boolean {
  return /^baf[a-z0-9]{50,}|^Qm[1-9A-HJ-NP-Za-km-z]{40,}/.test(input);
}

export function getImageUrl(path: string | undefined | null): string {
  if (!path) return "";

  const trimmed = path.trim();

  // Already absolute URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // ipfs://CID[/subpath]
  if (trimmed.startsWith("ipfs://")) {
    return `${PINATA_GATEWAY}/${trimmed.replace("ipfs://", "")}`;
  }

  // Bare CID
  if (looksLikeCid(trimmed)) {
    return `${PINATA_GATEWAY}/${trimmed}`;
  }

  // Treat as local/static path
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
