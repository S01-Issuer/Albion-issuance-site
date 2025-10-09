import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Multiple IPFS gateways for fallback
const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs',
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs',
];

// Simple in-memory cache to reduce gateway requests
const cache = new Map<string, { body: ArrayBuffer; contentType: string; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function fetchFromGateways(path: string, fetchFn: typeof fetch): Promise<Response> {
  let lastError: Error | null = null;

  for (const gateway of IPFS_GATEWAYS) {
    try {
      const ipfsUrl = `${gateway}/${path}`;
      
      const response = await fetchFn(ipfsUrl, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
        },
      });

      if (response.ok) {
        return response;
      }

      // If we get a 429, try next gateway immediately
      if (response.status === 429) {
        console.warn(`Rate limited on ${gateway}, trying next gateway...`);
        continue;
      }

      // For other errors, store and try next gateway
      lastError = new Error(`${gateway}: ${response.status} ${response.statusText}`);
    } catch (err) {
      console.warn(`Failed to fetch from ${gateway}:`, err);
      lastError = err as Error;
      continue;
    }
  }

  throw lastError || new Error('All gateways failed');
}

export const GET: RequestHandler = async ({ params, fetch, setHeaders }) => {
  const { path } = params;

  if (!path) {
    throw error(400, 'Path is required');
  }

  // Check cache first
  const cached = cache.get(path);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    setHeaders({
      'Content-Type': cached.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Cache': 'HIT',
    });
    return new Response(cached.body);
  }

  try {
    const response = await fetchFromGateways(path, fetch);

    // Get the content type from the upstream response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Get the response body
    const body = await response.arrayBuffer();

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
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Cache': 'MISS',
    });

    return new Response(body);
  } catch (err) {
    console.error('IPFS proxy error:', err);
    
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    
    throw error(503, 'All IPFS gateways are unavailable. Please try again later.');
  }
};

export const HEAD: RequestHandler = async ({ params, fetch }) => {
  const { path } = params;

  if (!path) {
    throw error(400, 'Path is required');
  }

  try {
    const ipfsUrl = `${PINATA_GATEWAY}/${path}`;
    
    const response = await fetch(ipfsUrl, {
      method: 'HEAD',
    });

    if (!response.ok) {
      throw error(response.status, `Failed to fetch from IPFS: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (err) {
    console.error('IPFS proxy error:', err);
    
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    
    throw error(500, 'Failed to fetch from IPFS gateway');
  }
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

