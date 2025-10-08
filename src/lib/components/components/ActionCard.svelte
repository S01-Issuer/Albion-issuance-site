<script lang="ts">
	export let title: string;
	export let description: string;
	export let icon: string = '';
	export let actionText: string = 'Action';
	export let actionVariant: 'primary' | 'secondary' | 'claim' | 'manage' = 'primary';
	export let href: string | undefined = undefined;
	export let disabled: boolean = false;
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let centered: boolean = true;
	
	// Events
	import { createEventDispatcher } from 'svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import SecondaryButton from './SecondaryButton.svelte';
	const dispatch = createEventDispatcher();

	function handleAction() {
		if (!disabled) {
			dispatch('action');
		}
	}
	
	// Tailwind class mappings
	const sizeClasses = {
		small: {
			card: 'p-4 md:p-6',
			icon: 'text-2xl mb-3 md:text-xl md:mb-3',
			title: 'text-xs mb-1.5 md:text-xs',
			description: 'text-xs mb-4 md:text-xs',
			button: 'px-4 py-2 text-xs min-w-[100px] md:w-full md:min-w-0'
		},
		medium: {
			card: 'p-8 md:p-6',
			icon: 'text-3xl mb-4 md:text-2xl md:mb-3',
			title: 'text-sm mb-2 md:text-sm',
			description: 'text-sm mb-6 md:text-xs',
			button: 'px-6 py-3 text-sm min-w-[120px] md:w-full md:min-w-0'
		},
		large: {
			card: 'p-10 md:p-8',
			icon: 'text-4xl mb-5 md:text-2xl md:mb-3',
			title: 'text-base mb-2.5 md:text-sm',
			description: 'text-sm mb-7 md:text-xs',
			button: 'px-8 py-4 text-sm min-w-[140px] md:w-full md:min-w-0'
		}
	};
	
	const buttonSizeMap = {
		small: 'small',
		medium: 'medium',
		large: 'large'
	} as const;

	$: cardClasses = `bg-white border border-light-gray rounded-lg transition-all duration-200 ${sizeClasses[size].card} ${centered ? 'text-center' : ''}`;
	$: iconClasses = `block mx-auto ${sizeClasses[size].icon}`;
	$: titleClasses = `font-extrabold text-black uppercase tracking-wide leading-tight ${sizeClasses[size].title}`;
	$: descriptionClasses = `text-black opacity-70 leading-relaxed ${sizeClasses[size].description}`;
	$: ButtonComponent = actionVariant === 'secondary' || actionVariant === 'manage' ? SecondaryButton : PrimaryButton;
	$: buttonSize = buttonSizeMap[size];
	$: buttonFullWidth = size !== 'small';
</script>

<div class={cardClasses}>
	{#if icon}
		<div class={iconClasses}>{icon}</div>
	{/if}
	
	<h4 class={titleClasses}>{title}</h4>
	
	<p class={descriptionClasses}>{description}</p>
	
	{#if href && !disabled}
		<svelte:component
			this={ButtonComponent}
			href={href}
			size={buttonSize}
			fullWidth={buttonFullWidth}
		>
			{actionText}
		</svelte:component>
	{:else}
		<svelte:component
			this={ButtonComponent}
			size={buttonSize}
			fullWidth={buttonFullWidth}
			{disabled}
			on:click={handleAction}
		>
			{actionText}
		</svelte:component>
	{/if}
</div>
