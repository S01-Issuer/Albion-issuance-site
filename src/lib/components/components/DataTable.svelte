<script lang="ts">
	
	export let columns: string[] = [];
	export let columnWidths: string = '';
	export let className = '';
	
	$: headerClasses = `grid items-center gap-4 p-4 bg-light-gray border-b border-light-gray ${columnWidths}`;
	$: containerClasses = `bg-white border border-light-gray p-8 overflow-hidden ${className}`;
</script>

<div class={containerClasses}>
	{#if columns.length > 0}
		<div class={headerClasses}>
			{#each columns as column, index (`${index}-${column}`)}
				<div class="font-extrabold text-black text-xs uppercase tracking-wider">
					{column}
				</div>
			{/each}
		</div>
	{/if}
	<slot />
</div>
