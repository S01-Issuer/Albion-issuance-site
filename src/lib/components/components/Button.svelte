<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	
	// Props
	export let variant: 'primary' | 'secondary' = 'primary';
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let fullWidth = false;
	export let disabled = false;
	export let type: 'button' | 'submit' | 'reset' = 'button';
	export let href: string | undefined = undefined;
	
	const dispatch = createEventDispatcher();
	
	function handleClick(event: MouseEvent) {
		if (!disabled) {
			dispatch('click', event);
		}
	}
	
	// Tailwind class mappings
	const sizeClasses = {
		small: 'px-4 py-2 text-xs md:px-3.5 md:py-2 md:text-xs',
		medium: 'px-6 py-3 text-sm md:px-5 md:py-2.5 md:text-sm',
		large: 'px-8 py-4 text-base md:px-7 md:py-3.5 md:text-sm'
	};
	
	const variantClasses = {
		primary: 'bg-black text-white border-black hover:bg-secondary focus:outline-primary focus:outline-2 focus:outline-offset-2',
		secondary: 'bg-white text-black border-black hover:bg-primary hover:text-white hover:border-primary focus:outline-primary focus:outline-2 focus:outline-offset-2'
	};
	
	$: classes = `inline-flex items-center justify-center font-semibold uppercase tracking-wide cursor-pointer transition-all duration-200 border-2 whitespace-nowrap relative overflow-hidden appearance-none font-figtree active:translate-y-px ${sizeClasses[size]} ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none hover:bg-inherit hover:text-inherit hover:border-inherit' : ''}`.trim();
</script>

{#if href && !disabled}
	<a 
		{href}
		class={classes}
		on:click={handleClick}
	>
		<slot />
	</a>
{:else}
	<button
		{type}
		{disabled}
		class={classes}
		on:click={handleClick}
	>
		<slot />
	</button>
{/if}
