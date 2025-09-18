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
			<div class="prose prose-lg max-w-none">
				{@html html}
			</div>
		</div>
	</ContentSection>
</PageLayout>
