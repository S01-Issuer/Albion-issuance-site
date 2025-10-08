<script lang="ts">
	export let isOpen: boolean = false;
	export let title: string = '';
	export let size: 'small' | 'medium' | 'large' | 'full' = 'medium';
	export let centered: boolean = true;
	export let closable: boolean = true;
	export let closeOnOverlayClick: boolean = true;
	export let closeOnEscape: boolean = true;
	export let showHeader: boolean = true;
	export let showFooter: boolean = false;
	export let maxHeight: string = '90vh';

	// Events
	import { createEventDispatcher, onDestroy } from 'svelte';
	const dispatch = createEventDispatcher();

	let modalElement: HTMLDivElement;
	let previouslyFocused: HTMLElement | null = null;

	function closeModal() {
		if (closable) {
			isOpen = false;
			dispatch('close');
		}
	}

	function handleOverlayClick(event: MouseEvent) {
		if (closeOnOverlayClick && event.target === event.currentTarget) {
			closeModal();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (closeOnEscape && event.key === 'Escape') {
			closeModal();
		}
		
		// Trap focus within modal
		if (event.key === 'Tab') {
			trapFocus(event);
		}
	}

	function trapFocus(event: KeyboardEvent) {
		if (!modalElement) return;

		const focusableElements = modalElement.querySelectorAll(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		const firstElement = focusableElements[0] as HTMLElement;
		const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

		if (event.shiftKey) {
			if (document.activeElement === firstElement) {
				lastElement?.focus();
				event.preventDefault();
			}
		} else {
			if (document.activeElement === lastElement) {
				firstElement?.focus();
				event.preventDefault();
			}
		}
	}

	function handleModalOpen(open: boolean) {
		if (open) {
			previouslyFocused = document.activeElement as HTMLElement;
			document.body.style.overflow = 'hidden';
			
			// Focus the modal after it's rendered
			setTimeout(() => {
				const firstFocusable = modalElement?.querySelector(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				) as HTMLElement;
				
				if (firstFocusable) {
					firstFocusable.focus();
				} else {
					modalElement?.focus();
				}
			}, 100);
		} else {
			document.body.style.overflow = '';
			if (previouslyFocused) {
				previouslyFocused.focus();
				previouslyFocused = null;
			}
		}
	}

	$: if (typeof window !== 'undefined') {
		handleModalOpen(isOpen);
	}

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			document.body.style.overflow = '';
		}
	});
	
	// Tailwind class mappings
	const sizeClasses = {
		small: 'max-w-sm',
		medium: 'max-w-2xl',
		large: 'max-w-4xl',
		full: 'max-w-[95vw] max-h-[95vh]'
	};
	
	$: overlayClasses = `fixed inset-0 bg-black/50 flex z-[1000] overflow-y-auto p-4 box-border ${centered ? 'items-center justify-center' : 'items-start justify-center pt-8'}`;
	$: modalClasses = [
		'bg-white border-2 border-black w-full overflow-y-auto relative flex flex-col animate-modal-slide',
		sizeClasses[size],
		`max-h-[${maxHeight}]`,
	].join(' ');
	const headerClasses = 'flex justify-between items-center px-8 py-6 border-b border-light-gray flex-shrink-0';
	const titleClasses = 'typography-h3 text-black m-0 uppercase tracking-wide';
	const closeClasses = 'bg-transparent border-none text-2xl text-black cursor-pointer p-0 w-8 h-8 flex items-center justify-center transition-opacity duration-200 rounded hover:opacity-70 hover:bg-light-gray focus:outline-primary focus:outline-2 focus:outline-offset-2';
	const contentClasses = 'p-8 flex-1 overflow-y-auto min-h-0';
	const footerClasses = 'px-8 py-4 pb-6 border-t border-light-gray flex-shrink-0 flex gap-4 justify-end items-center';
	const titleWrapperClasses = 'flex-1';
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div 
		class={overlayClasses}
		on:click={handleOverlayClick}
	>
		<div 
			bind:this={modalElement}
			class={modalClasses}
			role="dialog" 
			aria-modal="true" 
			aria-labelledby={title ? 'modal-title' : undefined}
			tabindex="0"
			on:click|stopPropagation
		>
			{#if showHeader}
				<div class={headerClasses}>
					{#if title}
						<h3 id="modal-title" class={titleClasses}>{title}</h3>
					{:else}
						<div class={titleWrapperClasses}>
							<slot name="title" />
						</div>
					{/if}
					
					{#if closable}
						<button 
							class={closeClasses}
							on:click={closeModal}
							aria-label="Close modal"
						>
							×
						</button>
					{/if}
				</div>
			{/if}

			<div class={contentClasses}>
				<slot />
			</div>

			{#if showFooter || $$slots.footer}
				<div class={footerClasses}>
					<slot name="footer" />
				</div>
			{/if}
		</div>
	</div>
{/if}
