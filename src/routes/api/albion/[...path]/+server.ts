import { json, type RequestEvent } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const ALBION_API_BASE = "https://api.albionlabs.org";

export async function GET({ params, url }: RequestEvent) {
  return proxyRequest("GET", params.path, url.searchParams);
}

export async function POST({ params, request, url }: RequestEvent) {
  const body = await request.json();
  return proxyRequest("POST", params.path, url.searchParams, body);
}

async function proxyRequest(
  method: string,
  path: string | undefined,
  searchParams: URLSearchParams,
  body?: unknown,
) {
  const apiKey = env.PRIVATE_ALBION_API_KEY;
  const apiSecret = env.PRIVATE_ALBION_API_SECRET;

  if (!apiKey || !apiSecret) {
    return json(
      { error: "Albion API credentials not configured" },
      { status: 500 },
    );
  }

  const targetUrl = new URL(`/${path}`, ALBION_API_BASE);
  searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));

  const credentials = btoa(`${apiKey}:${apiSecret}`);

  try {
    const res = await fetch(targetUrl.toString(), {
      method,
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Albion API error [${res.status}]:`, text);
      return json(
        { error: "Albion API request failed" },
        { status: res.status },
      );
    }

    const data = await res.json();
    return json(data);
  } catch (err) {
    console.error("Albion API proxy error:", err);
    return json({ error: "Albion API request failed" }, { status: 500 });
  }
}
