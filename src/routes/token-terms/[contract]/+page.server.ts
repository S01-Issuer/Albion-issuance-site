import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { renderMarkdown } from "$lib/utils/markdown";

export const load: PageServerLoad = async ({ params, fetch }) => {
	const contract = params.contract?.toLowerCase();

	if (!contract) {
		throw error(404, "Token terms not found");
	}

	// Always use lowercase for the filename since we'll standardize on that
	const response = await fetch(`/token_terms/${contract}.md`);

	if (!response.ok) {
		throw error(404, "Token terms not found");
	}

	const markdown = await response.text();
	const html = renderMarkdown(markdown);

	return {
		contract,
		html,
	};
};