import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

export const GET: RequestHandler = async ({ params, fetch }) => {
  const { path } = params;

  if (!path) {
    throw error(400, 'Path is required');
  }

  try {
    const ipfsUrl = `${PINATA_GATEWAY}/${path}`;
    
    const response = await fetch(ipfsUrl, {
      method: 'GET',
      headers: {
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      throw error(response.status, `Failed to fetch from IPFS: ${response.statusText}`);
    }

    // Get the content type from the upstream response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Get the response body
    const body = await response.arrayBuffer();

    return new Response(body, {
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

