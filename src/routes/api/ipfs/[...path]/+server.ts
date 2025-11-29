import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { env as publicEnv } from "$env/dynamic/public";
import { pinata } from "$lib/server/pinata";

// Simple in-memory cache to reduce gateway requests
const cache = new Map<
  string,
  { body: Uint8Array; contentType: string; timestamp: number }
>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const MAX_RETRIES = 2;
const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 250;

const fallbackGateways = [
  publicEnv.PUBLIC_IPFS_FALLBACK_GATEWAY,
  "https://ipfs.io/ipfs",
  "https://eu.orbitor.dev/ipfs",
].filter((gateway): gateway is string => Boolean(gateway));

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

  // Check cache first
  const cached = cache.get(path);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    setHeaders({
      "Content-Type": cached.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "X-Cache": "HIT",
    });
    return new Response(cached.body);
  }

  try {
    // Try primary Pinata gateway first
    try {
      const { body, contentType } = await fetchFromPinata(path);
      cache.set(path, { body, contentType, timestamp: Date.now() });
      cleanCache();
      setHeaders({
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "X-Cache": "MISS",
        "X-Gateway": "pinata",
      });
      return new Response(body);
    } catch (primaryError) {
      console.error("IPFS proxy Pinata error:", primaryError);
    }

    // Try fallback public gateways
    for (const gateway of fallbackGateways) {
      try {
        const { body, contentType } = await fetchFromHttpGateway(
          gateway,
          path,
        );
        cache.set(path, { body, contentType, timestamp: Date.now() });
        cleanCache();
        setHeaders({
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "X-Cache": "MISS",
          "X-Gateway": gateway,
        });
        return new Response(body);
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
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
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
