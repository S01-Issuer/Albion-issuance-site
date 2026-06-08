import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const STORAGE_KEY = "albion-verified-cids";

function loadVerified(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}
let verified: Set<string> = loadVerified();

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...verified]));
  } catch {
    /* quota/private mode — in-memory set still works */
  }
}

/** Verify bytes hash to expectedCid (CIDv1, raw codec, sha-256). Verify-once-trust-forever. */
export async function verifyCid(
  bytes: Uint8Array,
  expectedCid: string,
): Promise<boolean> {
  if (verified.has(expectedCid)) return true;
  try {
    // Normalize to a Uint8Array from the current realm. Some runtimes (e.g.
    // jsdom under vitest) hand back typed arrays from a different realm whose
    // identity checks fail inside multiformats' binary coercion.
    const input = new Uint8Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    const digest = await sha256.digest(input);
    const cid = CID.create(1, raw.code, digest).toString();
    if (cid === expectedCid) {
      verified.add(expectedCid);
      persist();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** test-only */
export function __resetVerifiedCidCacheForTest() {
  verified = new Set();
}
