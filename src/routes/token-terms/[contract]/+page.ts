import type { PageLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { renderMarkdown } from "$lib/utils/markdown";

export const load: PageLoad = async ({ fetch, params }) => {
	const contract = params.contract?.toLowerCase();

	if (!contract) {
		throw error(404, "Token terms not found");
	}

	const response = await fetch(`/token_terms/${contract}.md`);

	if (!response.ok) {
		throw error(response.status, "Token terms not found");
	}

	const markdown = await response.text();
	const html = renderMarkdown(markdown);

	return {
		contract,
		html,
	};
};
