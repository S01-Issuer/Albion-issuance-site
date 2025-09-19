import { marked } from 'marked';

marked.setOptions({
	gfm: true,
	breaks: true,
	pedantic: false,
});

export function renderMarkdown(markdown: string): string {
	return marked.parse(markdown) as string;
}