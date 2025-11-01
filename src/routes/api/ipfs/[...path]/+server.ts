import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { pinata } from "$lib/server/pinata";

// Simple in-memory cache to reduce gateway requests
const cache = new Map<
  string,
  { body: Uint8Array; contentType: string; timestamp: number }
>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

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
    // Use Pinata SDK to get the file
    const data = await pinata.gateways.get(path);

    // Pinata SDK returns { data: string, contentType: string } format
    let actualData: unknown;
    let contentType = "application/octet-stream";

    if (
      data &&
      typeof data === "object" &&
      "data" in data &&
      "contentType" in data
    ) {
      // Pinata SDK response format
      actualData = data.data;
      contentType = data.contentType || "application/octet-stream";
    } else {
      // Fallback for other response types
      actualData = data;
      if (typeof data === "string") {
        contentType = "text/plain";
      } else if (data && typeof data === "object") {
        contentType = "application/json";
      }
    }

    // Handle the response - convert to ArrayBuffer
    let body: Uint8Array;
    if (actualData instanceof Uint8Array) {
      body = actualData;
    } else if (actualData instanceof ArrayBuffer) {
      body = new Uint8Array(actualData);
    } else if (actualData instanceof Blob) {
      body = new Uint8Array(await actualData.arrayBuffer());
    } else if (typeof actualData === "string") {
      body = new TextEncoder().encode(actualData);
    } else {
      // Stringify objects that aren't already strings
      body = new TextEncoder().encode(JSON.stringify(actualData));
      contentType = "application/json";
    }

    // Cache the response
    cache.set(path, { body, contentType, timestamp: Date.now() });

    // Clean up old cache entries periodically
    if (cache.size > 100) {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          cache.delete(key);
        }
      }
    }

    setHeaders({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "X-Cache": "MISS",
    });

    return new Response(body);
  } catch (err) {
    console.error("IPFS proxy error:", err);

    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }

    throw error(
      503,
      "Failed to fetch from Pinata gateway. Please try again later.",
    );
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
