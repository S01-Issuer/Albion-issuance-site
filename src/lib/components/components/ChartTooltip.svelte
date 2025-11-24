<script lang="ts">
	export let show: boolean = false;
	export let x: number = 0;
	export let y: number = 0;
	export let value: string | number = '';
	export let label: string = '';
	export let valuePrefix: string = '';
	export let valueSuffix: string = '';
	export let align: 'left' | 'center' | 'right' = 'center';
	
	$: alignmentClass = {
		left: 'left-0',
		center: 'left-1/2 -translate-x-1/2',
		right: 'right-0'
	}[align];
	
	function formatValue(val: string | number): string {
		if (typeof val === 'number') {
			return valuePrefix + val.toLocaleString() + valueSuffix;
		}
		return valuePrefix + val + valueSuffix;
	}
</script>

{#if show}
	<div 
		class="absolute pointer-events-none z-50 bg-black text-white px-3 py-2 rounded-none text-xs whitespace-nowrap shadow-lg {alignmentClass}"
		style="left: {align === 'center' ? x : align === 'left' ? x : 'auto'}px; top: {y - 40}px; {align === 'right' ? `right: ${x}px` : ''}"
	>
		{#if label}
			<div class="text-xs opacity-80 mb-0.5">{label}</div>
		{/if}
		<div class="font-bold">{formatValue(value)}</div>
		<div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
			<div class="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black"></div>
		</div>
	</div>
{/if}