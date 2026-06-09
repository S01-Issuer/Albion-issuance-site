import type { RequestHandler } from "./$types";
import { put, head, type HeadBlobResult } from "@vercel/blob";
import { verifyCidBytes } from "$lib/server/cidContent";
import {
  BUNDLE_SCHEMA_VERSION,
  collectClaimCids,
  computeSetHash,
} from "$lib/utils/claimsBundle";

// Immutable is safe ONLY because the URL is content-addressed by setHash —
// a new release means new CIDs → new deployment → new setHash → new URL.
// Errors must NOT be long-cached: a rollback makes an old setHash current
// again, and an edge-cached immutable 404 would pin the fallback for a year.
const IMMUTABLE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=31536000, immutable",
  "CDN-Cache-Control": "public, s-maxage=31536000, immutable",
  "Access-Control-Allow-Origin": "*",
} as const;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const memory = new Map<string, string>(); // setHash → envelope JSON
const inFlight = new Map<string, Promise<string>>(); // cold-build stampede coalescing

const blobKey = (setHash: string) => `claims-bundle/${setHash}.json`;

async function readFromBlob(setHash: string): Promise<string | null> {
  try {
    const meta: HeadBlobResult | null = await head(blobKey(setHash)).catch(
      () => null,
    );
    if (!meta?.url) return null;
    const response = await fetch(meta.url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function writeToBlob(setHash: string, json: string): Promise<void> {
  try {
    await put(blobKey(setHash), json, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true, // content-addressed — idempotent re-writes are fine
      contentType: "application/json",
    });
  } catch (err) {
    // Blob is an optimization; memory + edge still serve this deployment.
    console.warn("claims-bundle: failed to persist to Blob:", err);
  }
}

async function buildEnvelope(
  setHash: string,
  cids: string[],
  fetchFn: typeof fetch,
): Promise<string> {
  const entries = await Promise.all(
    cids.map(async (cid) => {
      const response = await fetchFn(`/api/ipfs/${cid}`);
      if (!response.ok) {
        throw new Error(
          `claims-bundle: fetch ${cid} failed (${response.status})`,
        );
      }
      const text = new TextDecoder().decode(
        new Uint8Array(await response.arrayBuffer()),
      );
      // Verify what we PERSIST (post text round-trip), not what we fetched —
      // proves the JSON envelope will re-hash correctly on the client.
      const reEncoded = new TextEncoder().encode(text);
      const verdict = await verifyCidBytes(
        cid,
        new Uint8Array(reEncoded.buffer, reEncoded.byteOffset, reEncoded.byteLength),
      );
      if (verdict !== "ok") {
        throw new Error(`claims-bundle: CID verification ${verdict} for ${cid}`);
      }
      return [cid, text] as const;
    }),
  );
  const files: Record<string, string> = {};
  for (const [cid, text] of entries) files[cid] = text;
  return JSON.stringify({ schema: BUNDLE_SCHEMA_VERSION, setHash, files });
}

export const GET: RequestHandler = async ({ params, fetch }) => {
  const requested = params.setHash;
  const cids = collectClaimCids();
  const current = cids.length > 0 ? await computeSetHash(cids) : null;

  if (!requested || !current || requested !== current) {
    return new Response(JSON.stringify({ error: "unknown bundle" }), {
      status: 404,
      headers: NO_STORE_HEADERS,
    });
  }

  const cached = memory.get(current);
  if (cached) {
    return new Response(cached, {
      headers: { ...IMMUTABLE_HEADERS, "X-Cache": "HIT" },
    });
  }

  const fromBlob = await readFromBlob(current);
  if (fromBlob) {
    memory.set(current, fromBlob);
    return new Response(fromBlob, {
      headers: { ...IMMUTABLE_HEADERS, "X-Cache": "HIT", "X-Store": "blob" },
    });
  }

  let pending = inFlight.get(current);
  if (!pending) {
    pending = buildEnvelope(current, cids, fetch)
      .then(async (json) => {
        memory.set(current, json);
        await writeToBlob(current, json);
        return json;
      })
      .finally(() => inFlight.delete(current));
    inFlight.set(current, pending);
  }

  try {
    const json = await pending;
    return new Response(json, {
      headers: { ...IMMUTABLE_HEADERS, "X-Cache": "MISS" },
    });
  } catch (err) {
    console.error("claims-bundle build failed:", err);
    return new Response(JSON.stringify({ error: "bundle build failed" }), {
      status: 503,
      headers: NO_STORE_HEADERS,
    });
  }
};
