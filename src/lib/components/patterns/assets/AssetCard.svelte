<script lang="ts">
import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
import type { Asset } from '$lib/types/uiTypes';
import { Card, CardContent, PrimaryButton } from '$lib/components/components';
	import { formatCurrency, formatEndDate, formatSmartNumber } from '$lib/utils/formatters';
	import { useCatalogService } from '$lib/services';
	import { sfts } from '$lib/stores';
	import type { TokenMetadata } from '$lib/types/MetaboardTypes';
	import FormattedReturn from '$lib/components/components/FormattedReturn.svelte';
	import { getEnergyFieldId } from '$lib/utils/energyFieldGrouping';
	import { hasAvailableSupplySync } from '$lib/utils/supplyHelpers';
	import { calculateLifetimeIRR } from '$lib/utils/returnsEstimatorHelpers';
	import { formatSupplyDisplay } from '$lib/utils/supplyHelpers';
	import ReturnsEstimatorModal from '$lib/components/patterns/ReturnsEstimatorModal.svelte';

	export let asset: Asset;
	export let token: TokenMetadata[];
	export let energyFieldId: string | undefined = undefined; // Add energy field ID for navigation

	const dispatch = createEventDispatcher();
	const catalogService = useCatalogService();

	// Returns estimator modal state
	let showReturnsEstimator = false;
	let estimatorToken: TokenMetadata | null = null;
	let estimatorMintedSupply = 0;
	let estimatorAvailableSupply = 0;

	// Generate consistent asset URL from token contract address
	$: consistentAssetId = token.length > 0 ? getEnergyFieldId(token[0].contractAddress) : (energyFieldId || asset.id);
	
	// Scroll state management for token list
	let scrollContainer: HTMLDivElement;
	let canScrollUp = false;
	let canScrollDown = false;
	
	function checkScrollPosition() {
		if (!scrollContainer) return;
		
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		
		// Check if we can scroll up (not at top)
		canScrollUp = scrollTop > 0;
		
		// Check if we can scroll down (not at bottom)
		// Adding a small threshold (2px) to account for rounding errors
		canScrollDown = scrollTop + clientHeight < scrollHeight - 2;
	}
	
	function handleScroll() {
		checkScrollPosition();
	}
	
	onMount(() => {
		// Initial check after a small delay to ensure DOM is ready
		setTimeout(checkScrollPosition, 100);
	});
	
	// Re-check scroll position when available tokens change
	$: if (scrollContainer && hasAvailableTokens) {
		// Use requestAnimationFrame to ensure DOM is updated
		requestAnimationFrame(() => {
			checkScrollPosition();
		});
	}
	
	// Use asset data directly from the data store
	$: latestReport = asset.monthlyReports[asset.monthlyReports.length - 1] || null;

	// Use tokens array directly
	$: tokensArray = token;

	// Check if any tokens are available
	$: hasAvailableTokens = tokensArray.some(t => hasAvailableSupplySync(t));

	function handleBuyTokens(tokenAddress?: string) {
		// If a specific token address is provided, use it; otherwise use the first available token
		const targetTokenAddress = tokenAddress || (tokensArray.length > 0 ? tokensArray[0].contractAddress : null);
		dispatch('buyTokens', {
			assetId: asset.id,
			tokenAddress: targetTokenAddress
		});
	}

	function openReturnsEstimator(token: TokenMetadata, mintedSupply: number, availableSupply: number) {
		estimatorToken = token;
		estimatorMintedSupply = mintedSupply;
		estimatorAvailableSupply = availableSupply;
		showReturnsEstimator = true;
	}
	
	// Tailwind class mappings used in markup
	const assetDescriptionClasses = 'text-gray-700 text-sm leading-relaxed m-0 mb-4 line-clamp-2 font-figtree lg:line-clamp-3 lg:text-base lg:mb-6';
	const highlightedStatsClasses = 'grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4 my-3 lg:my-4 p-3 lg:p-4 bg-white rounded-none';
	const highlightStatClasses = 'flex flex-col items-center text-center';
	const highlightValueClasses = 'text-lg sm:text-xl lg:text-2xl font-extrabold text-secondary mb-1 font-figtree';
	const highlightLabelClasses = 'text-xs lg:text-sm text-gray-500 font-medium font-figtree';
	const viewDetailsSectionClasses = 'mt-4 lg:mt-6 mb-4 lg:mb-6';
	const tokensSectionClasses = 'mb-4 lg:mb-6';
	const tokensTitleClasses = 'text-base lg:text-lg font-extrabold text-black m-0 mb-3 lg:mb-4 font-figtree';
	const tokensListClasses = 'flex flex-col gap-2 lg:gap-3';
	const tokensListScrollableClasses = 'flex flex-col gap-2 lg:gap-3 max-h-[10rem] lg:max-h-[13rem] overflow-y-auto pr-1 lg:pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400';
	const tokenButtonClasses = 'flex flex-col sm:flex-row justify-between items-start sm:items-center w-full p-3 lg:p-4 bg-white rounded-none text-left relative border border-light-gray gap-2 sm:gap-0 transition-all duration-200 hover:bg-light-gray hover:shadow-md';
	const tokenButtonLeftClasses = 'flex flex-col gap-1 flex-1';
	const tokenSymbolClasses = 'font-extrabold text-sm lg:text-base text-black font-figtree';
	const tokenNameClasses = 'text-xs lg:text-sm text-gray-500 leading-tight font-figtree';

</script>

<Card hoverable clickable heightClass="h-full flex flex-col" on:click={() => goto(`/assets/${consistentAssetId}`)}>
	<!-- Universal: Image with overlay for all viewports -->
	<div class="relative">
		<div class="relative overflow-hidden">
			<img 
				src={asset.coverImage} 
				alt={asset.name} 
				class="w-full h-48 sm:h-56 lg:h-64 object-cover opacity-75 hover:opacity-60 transition-opacity duration-300"
			/>
			<!-- Gradient overlay -->
			<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent"></div>
			
			<!-- Content overlay - responsive sizing -->
			<div class="absolute bottom-0 left-0 right-0 p-4 lg:p-6">
				<h3 class="text-lg sm:text-xl lg:text-2xl font-extrabold text-white mb-1 sm:mb-2 drop-shadow-lg text-left">
					{asset.name}
				</h3>
				<p class="text-sm sm:text-base text-white/90 mb-2 sm:mb-3 drop-shadow-md text-left">
					{asset.location.state}, {asset.location.country}
				</p>
				<div class="flex items-center gap-2">
					<span class="text-xs sm:text-sm text-white/80 drop-shadow-md">Operator:</span>
					<span class="text-sm sm:text-base font-bold text-white drop-shadow-md">
						{asset.operator.name}
					</span>
				</div>
			</div>
		</div>
	</div>

	<CardContent paddingClass="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col">
		
		<!-- Key Stats -->
		<div class={highlightedStatsClasses}>
			<div class={highlightStatClasses}>
				<span class={highlightValueClasses}>{asset.plannedProduction?.projections.reduce((acc, curr) => acc + curr.production, 0) ? formatSmartNumber(asset.plannedProduction.projections.reduce((acc, curr) => acc + curr.production, 0), { suffix: ' boe' }) : 'TBD'}</span>
				<span class={highlightLabelClasses}>Exp. Remaining</span>
			</div>
			<div class={highlightStatClasses}>
				<span class={highlightValueClasses}>{latestReport && latestReport.netIncome !== undefined && latestReport.netIncome > 0 ? formatCurrency(latestReport.netIncome, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 'N/A'}</span>
				<span class={highlightLabelClasses}>Last Payment</span>
			</div>
			<!-- Third stat only on larger screens -->
			<div class="hidden lg:flex lg:flex-col lg:items-center lg:text-center">
				<span class={highlightValueClasses}>{formatEndDate(asset.technical?.expectedEndDate)}</span>
				<span class={highlightLabelClasses}>End Date</span>
			</div>
		</div>
		
		<!-- Description -->
		<p class={assetDescriptionClasses}>{asset.description}</p>
		
		<!-- View Details Button -->
		<div class={viewDetailsSectionClasses}>
			<PrimaryButton href="/assets/{consistentAssetId}" fullWidth on:click={(e) => e.stopPropagation()}>
				{hasAvailableTokens ? 'View Details' : 'View Details'}
			</PrimaryButton>
		</div>

		<!-- Available Tokens Section - Mobile Responsive -->
		{#if hasAvailableTokens}
		<div class={tokensSectionClasses}>
			<h4 class={tokensTitleClasses}>Available Tokens</h4>
			<div class="flex flex-col">
				{#if tokensArray.length > 2 && canScrollUp}
					<!-- Top scroll indicator - hidden on mobile -->
					<button 
						class="hidden lg:flex w-full py-1 items-center justify-center hover:bg-gray-50 transition-colors"
						on:click|stopPropagation={() => scrollContainer.scrollBy({ top: -100, behavior: 'smooth' })}
						aria-label="Scroll up to see more tokens"
					>
						<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
						</svg>
					</button>
				{/if}
				
		<div 
			bind:this={scrollContainer}
			on:scroll={handleScroll}
			class={tokensArray.length > 2 ? tokensListScrollableClasses : tokensListClasses}>
				{#each tokensArray as tokenItem (tokenItem.contractAddress)}
				{@const sftForToken = $sfts?.find(s => s.id.toLowerCase() === tokenItem.contractAddress.toLowerCase())}
				{@const maxSupplyForToken = catalogService.getTokenMaxSupply(tokenItem.contractAddress) ?? undefined}
				{@const mintedSupply = sftForToken?.totalShares ? formatSupplyDisplay(sftForToken.totalShares) : 0}
				{@const maxSupply = maxSupplyForToken ? formatSupplyDisplay(maxSupplyForToken) : 0}
				{@const currentReturns = calculateLifetimeIRR(tokenItem, 65, mintedSupply, 1)}
				{@const fullyDilutedReturns = calculateLifetimeIRR(tokenItem, 65, maxSupply, 1)}
					<div class={tokenButtonClasses}>
						<!-- Desktop: Full token info -->
						<div class="hidden sm:flex w-full justify-between items-start gap-4">
							<div class={tokenButtonLeftClasses}>
								<span class={tokenSymbolClasses}>{tokenItem.symbol}</span>
								<span class={tokenNameClasses}>{tokenItem.releaseName}</span>
								<button
									class="mt-2 px-3 py-1.5 bg-black text-white text-xs font-bold rounded-none hover:bg-primary hover:scale-105 transition-all duration-200 w-1/2"
									on:click|stopPropagation={() => handleBuyTokens(tokenItem.contractAddress)}
								>
									Buy
								</button>
							</div>
							<div class="flex flex-col items-start gap-2 border-l border-gray-300 pl-2">
								<div class="text-sm font-bold text-black text-left mb-1">Returns</div>
								<div class="flex items-center gap-3">
									<div class="flex items-center gap-1.5">
										<span class="text-xs text-gray-500 font-medium">Current:</span>
										<span class="text-base text-primary font-extrabold">
											<FormattedReturn value={currentReturns} />
										</span>
									</div>
									<div class="flex items-center gap-1.5">
										<span class="text-xs text-gray-500 font-medium">Fully Diluted:</span>
										<span class="text-base text-primary font-extrabold">
											<FormattedReturn value={fullyDilutedReturns} />
										</span>
									</div>
								</div>
								<button
									class="text-base font-semibold text-secondary hover:text-primary transition-colors"
									on:click|stopPropagation={() => openReturnsEstimator(tokenItem, mintedSupply, maxSupply)}
								>
									View returns estimator →
								</button>
							</div>
						</div>

						<!-- Mobile: Simplified token info -->
						<div class="sm:hidden flex flex-col w-full gap-3">
							<div class="flex justify-between items-start">
								<div class="flex-1">
									<span class={tokenSymbolClasses}>{tokenItem.symbol}</span>
									<span class={tokenNameClasses}>{tokenItem.releaseName}</span>
								</div>
								<div class="border-l border-gray-300 pl-2">
									<div class="text-xs font-bold text-black mb-1 text-left">Returns</div>
									<div class="flex flex-col gap-1 text-xs">
										<div class="flex items-center gap-1">
											<span class="text-gray-500">Current:</span>
											<span class="text-primary font-extrabold">
												<FormattedReturn value={currentReturns} />
											</span>
										</div>
										<div class="flex items-center gap-1">
											<span class="text-gray-500">Diluted:</span>
											<span class="text-primary font-extrabold">
												<FormattedReturn value={fullyDilutedReturns} />
											</span>
										</div>
									</div>
								</div>
							</div>
							<div class="flex flex-col gap-2">
								<button
									class="w-1/2 px-3 py-1.5 bg-black text-white text-xs font-bold rounded-none hover:bg-primary hover:scale-105 transition-all duration-200"
									on:click|stopPropagation={() => handleBuyTokens(tokenItem.contractAddress)}
								>
									Buy
								</button>
								<button
									class="text-sm font-semibold text-secondary hover:text-primary transition-colors text-left"
									on:click|stopPropagation={() => openReturnsEstimator(tokenItem, mintedSupply, maxSupply)}
								>
									View returns estimator →
								</button>
							</div>
						</div>
					</div>
				{/each}
				</div>
				
				{#if tokensArray.length > 2 && canScrollDown}
					<!-- Bottom scroll indicator - hidden on mobile -->
					<button 
						class="hidden lg:flex w-full py-1 items-center justify-center hover:bg-gray-50 transition-colors"
						on:click|stopPropagation={() => scrollContainer.scrollBy({ top: 100, behavior: 'smooth' })}
						aria-label="Scroll down to see more tokens"
					>
						<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
				{/if}
			</div>
		</div>
		{/if}
	</CardContent>
</Card>

<!-- Returns Estimator Modal -->
{#if estimatorToken}
	<ReturnsEstimatorModal
		bind:isOpen={showReturnsEstimator}
		token={estimatorToken}
		mintedSupply={estimatorMintedSupply}
		availableSupply={estimatorAvailableSupply}
	/>
{/if}
