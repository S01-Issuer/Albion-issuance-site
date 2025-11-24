<script lang="ts">
	import Card from './Card.svelte';
	import CardContent from './CardContent.svelte';
	import Label from './Label.svelte';
	import TextBlock from './TextBlock.svelte';
	
	export let icon: string = '';
	export let iconType: 'emoji' | 'number' | 'custom' = 'emoji';
	export let title: string;
	export let description: string;
	export let centered = true;
	export let hoverable = false;
	
	const iconSizeClasses = {
		emoji: 'text-4xl md:text-5xl mb-4',
		number: 'w-16 h-16 bg-black text-white rounded-full flex items-center justify-center text-2xl font-extrabold mx-auto mb-6',
		custom: 'mb-4'
	};
</script>

<Card {hoverable} roundedClass="rounded-none">
	<CardContent paddingClass="p-8">
		<div class={centered ? 'text-center' : ''}>
			{#if iconType === 'emoji'}
				<div class={iconSizeClasses.emoji}>{icon}</div>
			{:else if iconType === 'number'}
				<div class={iconSizeClasses.number}>{icon}</div>
			{:else}
				<div class={iconSizeClasses.custom}>
					<slot name="icon" />
				</div>
			{/if}
			
			<Label size="base" variant="strong" className="mb-4 block">{title}</Label>
			<TextBlock size="small" color="muted">{description}</TextBlock>
		</div>
	</CardContent>
</Card>