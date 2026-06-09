import type { RequestHandler } from "./$types";
import { collectClaimCids, computeSetHash } from "$lib/utils/claimsBundle";

/**
 * Discovery endpoint for the publish pipeline and external consumers: the
 * redirect target changes per release, so it must never be cached — only the
 * content-addressed [setHash] URL is immutable.
 */
export const GET: RequestHandler = async () => {
  const cids = collectClaimCids();
  if (cids.length === 0) {
    return new Response(JSON.stringify({ error: "no claims manifest" }), {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const setHash = await computeSetHash(cids);
  return new Response(null, {
    status: 307,
    headers: {
      Location: `/api/claims-bundle/${setHash}`,
      "Cache-Control": "no-store",
    },
  });
};
