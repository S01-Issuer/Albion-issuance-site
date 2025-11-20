<script lang="ts">
type TabDefinition = {
	id: string;
	label: string;
	disabled?: boolean;
	badge?: string | number;
};

export let tabs: TabDefinition[] = [];
	export let activeTab: string = '';
	export let variant: 'default' | 'minimal' | 'pills' = 'default';
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let fullWidth: boolean = false;
	export let centered: boolean = false;

	// Events
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	function handleTabClick(tabId: string) {
		const tab = tabs.find(t => t.id === tabId);
		if (!tab?.disabled) {
			activeTab = tabId;
			dispatch('tabChange', { tabId });
		}
	}

	function handleKeydown(event: KeyboardEvent, tabId: string) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleTabClick(tabId);
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			const currentIndex = tabs.findIndex(t => t.id === activeTab);
			const direction = event.key === 'ArrowLeft' ? -1 : 1;
			let nextIndex = currentIndex + direction;
			
			// Wrap around
			if (nextIndex < 0) nextIndex = tabs.length - 1;
			if (nextIndex >= tabs.length) nextIndex = 0;
			
			// Find next non-disabled tab
			while (tabs[nextIndex]?.disabled && nextIndex !== currentIndex) {
				nextIndex = (nextIndex + direction + tabs.length) % tabs.length;
			}
			
			if (!tabs[nextIndex]?.disabled) {
				handleTabClick(tabs[nextIndex].id);
			}
		}
	}
	
	// Tailwind class mappings
	const sizeClasses = {
		small: 'px-4 py-2 text-xs',
		medium: 'px-6 py-3 text-sm',
		large: 'px-8 py-4 text-base'
	};
	
	const variantClasses = {
		default: {
			container: 'bg-white border-b border-light-gray overflow-x-auto',
			tab: 'border-b-[3px] border-transparent hover:opacity-100 hover:bg-primary hover:text-white',
			active: 'opacity-100 border-black text-black',
			inactive: 'text-black opacity-60'
		},
		minimal: {
			container: 'bg-transparent',
			tab: 'rounded-none hover:bg-light-gray',
			active: 'bg-black text-white',
			inactive: 'text-black opacity-70 hover:opacity-100'
		},
		pills: {
			container: 'bg-light-gray rounded-none p-1',
			tab: 'rounded-none hover:bg-white',
			active: 'bg-white text-black shadow-sm',
			inactive: 'text-black opacity-70 hover:opacity-100'
		}
	};
	
	// Badge class mapping
	const badgeClasses = 'inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-white bg-primary rounded-full min-w-[1.25rem] h-5';

	$: containerClasses = `flex items-center gap-1 scroll-smooth ${
		fullWidth ? 'w-full' : ''
	} ${centered ? 'justify-center' : ''} ${variantClasses[variant].container}`;

	function getTabClasses(tab: TabDefinition): string {
		const isActive = activeTab === tab.id;
		const baseClasses = [
			'bg-transparent border-none font-bold cursor-pointer transition-all duration-200 whitespace-nowrap flex items-center gap-2 uppercase tracking-wide relative font-figtree',
			sizeClasses[size],
			variantClasses[variant].tab,
		].join(' ');
		const stateClasses = isActive
			? variantClasses[variant].active
			: variantClasses[variant].inactive;
		const disabledClasses = tab.disabled ? 'opacity-40 cursor-not-allowed' : '';
		return `${baseClasses} ${stateClasses} ${disabledClasses}`.trim();
	}
</script>

<div class={containerClasses} role="tablist">
	{#each tabs as tab (tab.id)}
		<button
			class={getTabClasses(tab)}
			disabled={tab.disabled}
			role="tab"
			aria-selected={activeTab === tab.id}
			aria-controls={`tabpanel-${tab.id}`}
			tabindex={activeTab === tab.id ? 0 : -1}
			on:click={() => handleTabClick(tab.id)}
			on:keydown={(e) => handleKeydown(e, tab.id)}
		>
			{tab.label}
			{#if tab.badge}
				<span class={badgeClasses}>{tab.badge}</span>
			{/if}
		</button>
	{/each}
</div>
