<script lang="ts">
	import { base } from '@wagmi/core/chains';

	let isOpen = false;

	// Network configuration
	const networks = [
		{
			id: base.id,
			name: 'Base',
			logo: '/assets/BASE.svg',
			chain: base
		}
		// Ready for expansion with more networks like:
		// { id: sepolia.id, name: 'Sepolia', logo: '/assets/SEPOLIA.svg', chain: sepolia }
	];

	const currentNetwork = networks[0]; // Currently only Base is supported

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function closeDropdown() {
		isOpen = false;
	}

	function selectNetwork(_network: typeof networks[0]) {
		// Network switching can be implemented here when needed
		// For now, just close the dropdown as Base is the only supported network
		closeDropdown();
	}
</script>

<div class="relative">
	<button
		class="flex items-center gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm bg-white border border-light-gray rounded-none hover:bg-light-gray hover:border-secondary transition-all duration-200 flex-shrink-0"
		on:click={toggleDropdown}
		aria-label="Select network"
		aria-haspopup="true"
		aria-expanded={isOpen}
	>
		<img
			src={currentNetwork.logo}
			alt={currentNetwork.name}
			class="w-4 h-4 sm:w-5 sm:h-5 rounded-none"
		/>
		<span class="hidden sm:inline font-medium">{currentNetwork.name}</span>
		<svg
			class="w-4 h-4 transition-transform duration-200"
			class:rotate-180={isOpen}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9l6 6 6-6" />
		</svg>
	</button>

	{#if isOpen}
		<div
			class="absolute top-full left-0 mt-2 bg-white border border-light-gray rounded-none shadow-lg z-50 min-w-max"
			on:click={closeDropdown}
			on:keydown={(e) => e.key === 'Escape' && closeDropdown()}
			role="menu"
			tabindex="-1"
		>
			{#each networks as network (network.id)}
				<button
					type="button"
					class="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-light-gray transition-colors duration-200 border-b border-light-gray last:border-b-0"
					class:font-semibold={network.id === currentNetwork.id}
					on:click={() => selectNetwork(network)}
					role="menuitem"
				>
					<img
						src={network.logo}
						alt={network.name}
						class="w-5 h-5 rounded-none"
					/>
					<span>{network.name}</span>
					{#if network.id === currentNetwork.id}
						<svg class="w-4 h-4 ml-auto text-primary" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Component styling handled via Tailwind classes */
</style>
