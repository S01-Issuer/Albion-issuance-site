import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

/**
 * Verify that `bytes` hash to `expectedCid` (CIDv1, raw codec, sha-256).
 *
 * Hashes on every call. The CID is immutable, but the bytes a gateway returns
 * are not guaranteed to match it — a stale, corrupted, or compromised gateway
 * can serve different bytes under the same URL. The hash IS the integrity
 * check, so it must run against the actual bytes of every response; caching a
 * "this CID was verified once" flag would trust the gateway and defeat the
 * purpose. A single sha-256 over a CSV is cheap (the costly merkle rebuild this
 * replaced is gone), so there is nothing to cache away.
 */
export async function verifyCid(
  bytes: Uint8Array,
  expectedCid: string,
): Promise<boolean> {
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
    return cid === expectedCid;
  } catch {
    return false;
  }
}
