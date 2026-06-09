// src/lib/utils/claimsBundle.ts
import { sha256 } from "multiformats/hashes/sha2";
import { ENERGY_FIELDS } from "$lib/network";

/** Bump when the envelope shape or hashing scheme changes. Shared by client and server. */
export const BUNDLE_SCHEMA_VERSION = 1;

export type ClaimsBundleEnvelope = {
  schema: number;
  setHash: string;
  /** cid → raw CSV text (ASCII; JSON round-trips the bytes faithfully for re-hashing) */
  files: Record<string, string>;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Unique, sorted rewards-CSV CIDs from the baked manifest. */
export function collectClaimCids(fields = ENERGY_FIELDS): string[] {
  const cids = new Set<string>();
  for (const field of fields)
    for (const token of field.sftTokens)
      for (const claim of token.claims)
        if (claim.expectedContentHash) cids.add(claim.expectedContentHash);
  return [...cids].sort();
}

/**
 * Bundle identity: sha256(schemaVersion + sorted CIDs), hex. The server route
 * imports THIS function — a second implementation could silently diverge
 * (separator, sort, casing) and 404 every request straight into the fallback.
 */
export async function computeSetHash(cids: string[]): Promise<string> {
  const encoded = new TextEncoder().encode(
    `v${BUNDLE_SCHEMA_VERSION}:${[...cids].sort().join(",")}`,
  );
  // Normalize to a Uint8Array from the current realm. Some runtimes (e.g.
  // jsdom under vitest) hand back typed arrays from a different realm whose
  // identity checks fail inside multiformats' binary coercion.
  const input = new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const digest = await sha256.digest(input);
  return toHex(digest.digest);
}

let bundlePromise: Promise<Map<string, Uint8Array>> | null = null;

/**
 * Fetch the claims bundle once per session (shared promise). Returns a map of
 * cid → raw CSV bytes. NEVER throws and never returns partial trust: callers
 * re-verify every entry with verifyCid before use, and any miss/failure lands
 * on the existing per-CSV fetch path.
 */
export function getClaimsBundle(
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, Uint8Array>> {
  if (!bundlePromise) {
    bundlePromise = loadBundle(fetchFn).catch(() => new Map<string, Uint8Array>());
  }
  return bundlePromise;
}

async function loadBundle(fetchFn: typeof fetch): Promise<Map<string, Uint8Array>> {
  const cids = collectClaimCids();
  if (cids.length === 0) return new Map();
  const setHash = await computeSetHash(cids);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchFn(`/api/claims-bundle/${setHash}`, {
      signal: controller.signal,
    });
    if (!response.ok) return new Map();
    const envelope = (await response.json()) as ClaimsBundleEnvelope;
    if (
      envelope?.schema !== BUNDLE_SCHEMA_VERSION ||
      typeof envelope.files !== "object" ||
      envelope.files === null
    ) {
      return new Map();
    }
    const encoder = new TextEncoder();
    const map = new Map<string, Uint8Array>();
    for (const [cid, text] of Object.entries(envelope.files)) {
      if (typeof text === "string") map.set(cid, encoder.encode(text));
    }
    return map;
  } finally {
    clearTimeout(timeout);
  }
}

export function __resetClaimsBundleForTest(): void {
  bundlePromise = null;
}
