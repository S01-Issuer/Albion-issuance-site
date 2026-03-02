import type { Handle } from "@sveltejs/kit";

const BLOCKED_COUNTRIES = new Set(["US", "DE"]);

export const handle: Handle = async ({ event, resolve }) => {
  const { url } = event;
  const path = url.pathname;

  // Geo-blocking: redirect blocked countries to /blocked page
  const country = event.request.headers.get("x-vercel-ip-country");
  if (country && BLOCKED_COUNTRIES.has(country) && path !== "/blocked") {
    return new Response(null, {
      status: 303,
      headers: { Location: "/blocked" },
    });
  }

  return resolve(event);
};
