<script lang="ts">
	export let title: string;
	export let isOpenByDefault = false;
	export let alwaysOpenOnDesktop = true;
	export let className = '';
	
	let isOpen = isOpenByDefault;
	
	function toggle() {
		isOpen = !isOpen;
	}
	
	$: containerClasses = `border border-light-gray rounded-none overflow-hidden ${className}`;
	$: headerClasses = `flex items-center justify-between p-4 bg-light-gray cursor-pointer hover:bg-gray-100 transition-colors duration-200 ${alwaysOpenOnDesktop ? 'lg:cursor-default lg:hover:bg-light-gray' : ''}`;
	$: contentClasses = `transition-all duration-300 ease-in-out ${isOpen ? 'block' : 'hidden'} ${alwaysOpenOnDesktop ? 'lg:block' : ''}`;
	$: iconClasses = `transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''} ${alwaysOpenOnDesktop ? 'lg:hidden' : ''}`;
	$: isInteractive = !alwaysOpenOnDesktop;
</script>

<div class={containerClasses}>
	<div 
		class={headerClasses}
		on:click={toggle}
		on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
		role="button"
		tabindex={isInteractive ? 0 : undefined}
		class:lg:cursor-default={alwaysOpenOnDesktop}
		class:lg:pointer-events-none={alwaysOpenOnDesktop}
	>
		<h3 class="text-lg font-bold text-black m-0">{title}</h3>
		<svg 
			class={iconClasses}
			width="20" 
			height="20" 
			viewBox="0 0 24 24" 
			fill="none" 
			stroke="currentColor" 
			stroke-width="2"
		>
			<path d="M6 9l6 6 6-6"/>
		</svg>
	</div>
	
	<div class={contentClasses}>
		<div class="p-4 pt-0 lg:p-6">
			<slot />
		</div>
	</div>
</div>