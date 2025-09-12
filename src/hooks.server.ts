import type { Handle } from "@sveltejs/kit";
import { verifySessionToken } from "$lib/server/auth";
import { BASIC_AUTH_USER, BASIC_AUTH_PASS } from "$env/static/private";

const ALLOWLIST = new Set<string>([
  "/login",
  "/favicon.ico",
  "/robots.txt",
  "/site.webmanifest",
  "/assets/logo.svg",
]);

function isAllowlisted(path: string) {
  if (path === "/login") return true;
  if (path.startsWith("/_app/")) return true; // SvelteKit assets
  if (path.startsWith("/images/") || path.startsWith("/assets/")) return true;
  if (
    path === "/interface-terms" ||
    path === "/privacy-policy" ||
    path === "/token-terms" ||
    path === "/legal"
  )
    return true;
  return ALLOWLIST.has(path);
}

export const handle: Handle = async ({ event, resolve }) => {
  // Read credentials from env; still gate even if missing so misconfigurations are obvious.
  const user = BASIC_AUTH_USER || "";
  const pass = BASIC_AUTH_PASS || "";

  const { url, cookies } = event;
  const path = url.pathname;

  const debug = false; // DEBUG_LOGIN not available in static env
  if (isAllowlisted(path)) {
    if (debug) console.log("[auth] allowlisted path", path);
    return resolve(event);
  }

  const token = cookies.get("auth-session");
  const tsStr = cookies.get("auth-timestamp");
  const timestamp = tsStr ? Number(tsStr) : NaN;

  const valid =
    token && Number.isFinite(timestamp) && verifySessionToken(token, timestamp);
  if (debug) {
    console.log("[auth] path", path, {
      haveUser: !!user,
      havePass: !!pass,
      hasToken: !!token,
      ts: tsStr,
      valid,
    });
  }

  if (valid) {
    return resolve(event);
  }

  let search = '';
  try {
    search = url.search || '';
  } catch (e) {
    // url.search not available during prerendering
    search = '';
  }
  
  const params = new URLSearchParams({ 
    redirectTo: url.pathname + search
  });
  return new Response(null, {
    status: 303,
    headers: { Location: `/login?${params.toString()}` },
  });
};
