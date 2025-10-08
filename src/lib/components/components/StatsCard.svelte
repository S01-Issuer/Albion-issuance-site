<script lang="ts">
	import Card from './Card.svelte';
	import CardContent from './CardContent.svelte';
	import Label from './Label.svelte';
	
	export let title: string;
	export let value: string | number;
	export let subtitle: string = '';
	export let trend: { value: number; positive: boolean } | null = null;
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let valueColor: 'default' | 'primary' | 'secondary' = 'default';
	
	const sizeClasses = {
		small: 'p-4',
		medium: 'p-6', 
		large: 'p-8'
	};
	
	const valueSizeClasses = {
		small: 'text-xl md:text-2xl',
		medium: 'text-2xl md:text-3xl',
		large: 'text-3xl md:text-4xl'
	};
	
	const valueColorClasses = {
		default: 'text-black',
		primary: 'text-primary',
		secondary: 'text-secondary'
	};
	
	function formatTrend(value: number): string {
		const sign = value >= 0 ? '+' : '';
		return `${sign}${value.toFixed(1)}%`;
	}
</script>

<Card hoverable={false} showBorder={false}>
	<CardContent paddingClass={sizeClasses[size]}>
		<div class="text-center">
			<div class="{valueSizeClasses[size]} font-extrabold {valueColorClasses[valueColor]} mb-2 font-figtree">
				{value}
			</div>
			<Label variant="muted" size="xs">{title}</Label>
			{#if subtitle || trend}
				<div class="mt-2 text-sm">
					{#if trend}
						<span class="{trend.positive ? 'text-primary' : 'text-red-600'} font-semibold">
							{formatTrend(trend.value)}
						</span>
					{/if}
					{#if subtitle}
						<span class="text-black opacity-70"> {subtitle}</span>
					{/if}
				</div>
			{/if}
		</div>
	</CardContent>
</Card>
