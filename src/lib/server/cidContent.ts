import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

export type CidVerdict = "ok" | "mismatch" | "unverifiable";

/**
 * Verify that `bytes` hash to the CID in `path` (CIDv1, raw codec, sha-256 —
 * the form all CSV `expectedContentHash` values use). Used server-side before
 * persisting a gateway response so a corrupt/malicious body is never cached.
 *
 *   "ok"           — bytes match the CID; safe to cache
 *   "mismatch"     — bytes do NOT match; reject, never cache (poison/corruption)
 *   "unverifiable" — path isn't a bare raw+sha256 CID (e.g. a CIDv0 / dag-pb
 *                    directory or a subpath), so it can't be cheaply verified
 *                    here; cache as-is (the client still re-hashes CSVs).
 */
export async function verifyCidBytes(
  path: string,
  bytes: Uint8Array,
): Promise<CidVerdict> {
  let cid: CID;
  try {
    cid = CID.parse(path);
  } catch {
    return "unverifiable";
  }
  if (cid.code !== raw.code || cid.multihash.code !== sha256.code) {
    return "unverifiable";
  }
  // Normalize to a current-realm Uint8Array (jsdom/test realms otherwise trip
  // multiformats' binary coercion).
  const input = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const digest = await sha256.digest(input);
  return CID.create(1, raw.code, digest).equals(cid) ? "ok" : "mismatch";
}
