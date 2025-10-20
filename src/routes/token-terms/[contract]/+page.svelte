<script lang="ts">
	import { PageLayout, ContentSection } from '$lib/components/layout';
	import { SecondaryButton } from '$lib/components/components';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	const { contract, html } = data;

	function handleBack() {
		if (typeof window !== 'undefined' && window.history.length > 1) {
			window.history.back();
		} else {
			goto('/assets');
		}
	}
</script>

<svelte:head>
	<title>Token Terms - {contract}</title>
	<meta name="description" content="Token terms and conditions for contract {contract}" />
</svelte:head>

<PageLayout variant="constrained">
	<ContentSection background="white" padding="large">
		<div class="max-w-3xl mx-auto text-black">
			<div class="flex items-center justify-between gap-4 mb-8">
				<div>
					<h1 class="text-3xl sm:text-4xl font-extrabold uppercase tracking-wide mb-2">Token Terms</h1>
					<p class="text-sm sm:text-base opacity-70 break-all">Contract: {contract}</p>
				</div>
				<SecondaryButton on:click={handleBack}>Back to Assets</SecondaryButton>
			</div>
			<div class="prose prose-lg max-w-none token-terms-content">
				{@html html}
			</div>
		</div>
	</ContentSection>
</PageLayout>

<style>
	:global(.token-terms-content ol) {
		list-style-type: decimal;
		padding-left: 1.5rem;
	}

	:global(.token-terms-content ol ol) {
		list-style-type: lower-alpha;
		padding-left: 2rem;
	}

	:global(.token-terms-content ol ol ol) {
		list-style-type: lower-roman;
		padding-left: 2rem;
	}

	:global(.token-terms-content ul) {
		list-style-type: disc;
		padding-left: 1.5rem;
	}

	:global(.token-terms-content ul ul) {
		list-style-type: circle;
		padding-left: 2rem;
	}

	:global(.token-terms-content li) {
		margin: 0.5rem 0;
	}

	:global(.token-terms-content em) {
		font-style: italic;
	}

	:global(.token-terms-content strong) {
		font-weight: bold;
	}

	:global(.token-terms-content table) {
		width: 100%;
		border-collapse: collapse;
		margin: 1.5rem 0;
	}

	:global(.token-terms-content th) {
		background-color: #f8f4f4;
		padding: 0.75rem;
		text-align: left;
		font-weight: bold;
		border: 1px solid #e5e5e5;
	}

	:global(.token-terms-content td) {
		padding: 0.75rem;
		border: 1px solid #e5e5e5;
	}
</style>
