import type { PageLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { renderMarkdown } from "$lib/utils/markdown";
import { getAddress } from "viem";

export const load: PageLoad = async ({ fetch, params }) => {
  const rawContract = params.contract?.trim();

  if (!rawContract) {
    throw error(404, "Token terms not found");
  }

  const normalized = rawContract.toLowerCase();
  const candidates = new Set<string>();

  try {
    const checksum = getAddress(rawContract);
    candidates.add(checksum);
  } catch {
    // Ignore invalid address errors; we'll fall back to lowercase.
  }

  candidates.add(normalized);

  let lastStatus = 404;
  for (const candidate of candidates) {
    const response = await fetch(`/token_terms/${candidate}.md`);

    if (response.ok) {
      const markdown = await response.text();
      const html = renderMarkdown(markdown);

      return {
        contract: candidate,
        html,
      };
    }

    lastStatus = response.status;
  }

  throw error(lastStatus, "Token terms not found");
};
