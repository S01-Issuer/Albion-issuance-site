import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { env as publicEnv } from "$env/dynamic/public";
import { pinata } from "$lib/server/pinata";
import { put, head, type HeadBlobResult } from "@vercel/blob";
import { verifyCidBytes } from "$lib/server/cidContent";

// Three-layer origin for immutable IPFS content, fastest first:
//   1. in-memory Map  — instant, but lost on cold start / per-instance
//   2. Vercel Blob    — durable, ~ms, survives cold starts + deployments
//   3. Pinata / public gateways — slow (~2s), the source of truth
// The edge CDN (Cache-Control headers below) sits in front of all three, so a
// warm edge skips the function entirely; Blob makes the cold-edge misses cheap.
const cache = new Map<
  string,
  { body: Uint8Array; contentType: string; timestamp: number }
>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const MAX_RETRIES = 2;
const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 250;

const blobKey = (path: string) => `ipfs/${path}`;

async function readFromBlob(
  path: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  try {
    const meta: HeadBlobResult | null = await head(blobKey(path)).catch(
      () => null,
    );
    if (!meta?.url) return null;
    const response = await fetch(meta.url);
    if (!response.ok) return null;
    const body = new Uint8Array(await response.arrayBuffer());
    const contentType =
      meta.contentType ||
      response.headers.get("content-type") ||
      "application/octet-stream";
    return { body, contentType };
  } catch {
    return null;
  }
}

async function writeToBlob(
  path: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  try {
    await put(blobKey(path), Buffer.from(body), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true, // immutable content — idempotent re-writes are fine
      contentType,
    });
  } catch (err) {
    // Blob is an optimization; the in-memory cache + edge still serve this hit,
    // and the gateways remain the source of truth. Requires BLOB_READ_WRITE_TOKEN
    // in the deployment's runtime env (present on production; absent on previews
    // unless the Blob store is linked to the Preview environment).
    console.warn("IPFS proxy: failed to persist to Blob:", err);
  }
}

const fallbackGateways = [
  publicEnv.PUBLIC_IPFS_FALLBACK_GATEWAY,
  "https://ipfs.io/ipfs",
  "https://eu.orbitor.dev/ipfs",
].filter((gateway): gateway is string => Boolean(gateway));

// CIDs are immutable. `Cache-Control: max-age` caches in the browser; the
// `CDN-Cache-Control: s-maxage` makes Vercel's edge CDN cache the response too
// (max-age alone is browser-only). So the first global request per CID warms
// the edge, and every later request — any user, cold or warm instance — is
// served from the edge, skipping Pinata and the function entirely. Safe because
// the client re-hashes the bytes against the CID (verifyCid), so a poisoned or
// corrupt cached body is rejected rather than trusted.
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "CDN-Cache-Control": "public, s-maxage=31536000, immutable",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanCache = () => {
  if (cache.size <= 100) return;
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
};

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function normalizeGatewayData(
  data: unknown,
  contentTypeOverride?: string,
): Promise<{ body: Uint8Array; contentType: string }> {
  let body: Uint8Array;
  let contentType = contentTypeOverride || "application/octet-stream";

  if (data instanceof Uint8Array) {
    body = data;
  } else if (data instanceof ArrayBuffer) {
    body = new Uint8Array(data);
  } else if (data instanceof Blob) {
    body = new Uint8Array(await data.arrayBuffer());
    contentType = contentTypeOverride || data.type || contentType;
  } else if (typeof data === "string") {
    body = new TextEncoder().encode(data);
    contentType = contentTypeOverride || "text/plain";
  } else {
    body = new TextEncoder().encode(JSON.stringify(data));
    contentType = "application/json";
  }

  return { body, contentType };
}

async function fetchFromPinata(path: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    try {
      const data = await pinata.gateways.get(path);
      if (
        data &&
        typeof data === "object" &&
        "data" in data &&
        "contentType" in data
      ) {
        return await normalizeGatewayData(
          (data as { data: unknown }).data,
          (data as { contentType?: string }).contentType,
        );
      }
      return await normalizeGatewayData(data);
    } catch (error) {
      lastError = error;
      if (attempt <= MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
}

async function fetchFromHttpGateway(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const response = await fetchWithTimeout(`${normalizedBase}/${path}`);
  if (!response.ok) {
    throw new Error(
      `HTTP gateway ${normalizedBase} returned ${response.status}`,
    );
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  const contentType =
    response.headers.get("content-type") || "application/octet-stream";
  return { body: buffer, contentType };
}

export const GET: RequestHandler = async ({ params, setHeaders }) => {
  const { path } = params;

  if (!path) {
    throw error(400, "Path is required");
  }

  // L1: in-memory (per-instance, lost on cold start)
  const cached = cache.get(path);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    setHeaders({
      "Content-Type": cached.contentType,
      ...CACHE_HEADERS,
      "X-Cache": "HIT",
    });
    return new Response(cached.body);
  }

  // L2: Vercel Blob (durable, ~ms, survives cold starts + deployments). Blob
  // only ever holds CID-verified bytes (see persist() below), so it's trusted.
  const fromBlob = await readFromBlob(path);
  if (fromBlob) {
    cache.set(path, { ...fromBlob, timestamp: Date.now() });
    cleanCache();
    setHeaders({
      "Content-Type": fromBlob.contentType,
      ...CACHE_HEADERS,
      "X-Cache": "HIT",
      "X-Store": "blob",
    });
    return new Response(fromBlob.body);
  }

  // L3: origin gateways. Verify the CID BEFORE caching/persisting so a corrupt
  // or malicious gateway response is never written to Blob or served — a
  // mismatch is treated as a gateway failure and we fall through to the next.
  const persist = async (
    body: Uint8Array,
    contentType: string,
    gateway: string,
  ): Promise<Response> => {
    const verdict = await verifyCidBytes(path, body);
    if (verdict === "mismatch") {
      throw new Error(`CID mismatch from ${gateway}: bytes do not hash to ${path}`);
    }
    cache.set(path, { body, contentType, timestamp: Date.now() });
    cleanCache();
    await writeToBlob(path, body, contentType);
    setHeaders({
      "Content-Type": contentType,
      ...CACHE_HEADERS,
      "X-Cache": "MISS",
      "X-Gateway": gateway,
      "X-Cid-Verified": verdict === "ok" ? "true" : "unverifiable",
    });
    return new Response(body);
  };

  try {
    // Try primary Pinata gateway first
    try {
      const { body, contentType } = await fetchFromPinata(path);
      return await persist(body, contentType, "pinata");
    } catch (primaryError) {
      console.error("IPFS proxy Pinata error:", primaryError);
    }

    // Try fallback public gateways
    for (const gateway of fallbackGateways) {
      try {
        const { body, contentType } = await fetchFromHttpGateway(gateway, path);
        return await persist(body, contentType, gateway);
      } catch (fallbackError) {
        console.error(`IPFS proxy fallback error (${gateway}):`, fallbackError);
        continue;
      }
    }

    throw error(
      503,
      "Failed to fetch from IPFS gateway. Please try again later.",
    );
  } catch (err) {
    console.error("IPFS proxy error:", err);
    throw err;
  }
};

export const HEAD: RequestHandler = async ({ params }) => {
  const { path } = params;

  if (!path) {
    throw error(400, "Path is required");
  }

  try {
    // Check if file exists in cache
    const cached = cache.get(path);
    const contentType = cached?.contentType || "application/octet-stream";

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...CACHE_HEADERS,
      },
    });
  } catch (err) {
    console.error("IPFS proxy error:", err);

    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }

    throw error(500, "Failed to fetch from IPFS gateway");
  }
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
