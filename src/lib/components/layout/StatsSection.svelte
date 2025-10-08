<script lang="ts">
	export let columns: number = 3;
	export let title: string = '';
	export let showTitle = false;
	type BackgroundVariant = 'white' | 'gray' | 'secondary';
	type PaddingVariant = 'compact' | 'standard' | 'large';

	export let background: BackgroundVariant = 'white';
	export let padding: PaddingVariant = 'standard';
	export let className = '';

	const backgroundClasses: Record<BackgroundVariant, string> = {
		white: 'bg-white',
		gray: 'bg-light-gray',
		secondary: 'bg-secondary'
	};

	const paddingClasses: Record<PaddingVariant, string> = {
		compact: 'py-8 md:py-12',
		standard: 'py-16',
		large: 'py-24'
	};

	$: gridCols = {
		2: 'grid-cols-1 md:grid-cols-2',
		3: 'grid-cols-1 md:grid-cols-3',
		4: 'grid-cols-1 md:grid-cols-4',
		6: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
	}[columns] || 'grid-cols-1 md:grid-cols-3';

	$: sectionClasses = `${backgroundClasses[background]} ${paddingClasses[padding]} ${className}`;
</script>

<section class={sectionClasses}>
	<div class="max-w-6xl mx-auto px-8">
		{#if showTitle && title}
			<h2 class="typography-h2 text-black mb-6 text-center">{title}</h2>
		{/if}
		<div class={`grid ${gridCols} gap-8 text-center`}>
			<slot />
		</div>
	</div>
</section>
