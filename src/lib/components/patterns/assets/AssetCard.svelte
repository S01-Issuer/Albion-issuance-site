<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Asset, Token } from '$lib/types/uiTypes';
	import { Card, CardImage, CardContent, CardActions, PrimaryButton, SecondaryButton } from '$lib/components/components';
	import { formatCurrency, formatEndDate, formatSmartNumber } from '$lib/utils/formatters';
	import { getTokenReturns } from '$lib/utils';
	import { useCatalogService } from '$lib/services';
	import { sfts } from '$lib/stores';
	import type { TokenMetadata } from '$lib/types/MetaboardTypes';
	import FormattedReturn from '$lib/components/components/FormattedReturn.svelte';
	import { getEnergyFieldId } from '$lib/utils/energyFieldGrouping';
	import { hasAvailableSupplySync } from '$lib/utils/supplyHelpers';

	export let asset: Asset;
	export let token: TokenMetadata[];
	export let energyFieldId: string | undefined = undefined; // Add energy field ID for navigation

	const dispatch = createEventDispatcher();
	const catalogService = useCatalogService();

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
	$: primaryToken = tokensArray.length > 0 ? tokensArray[0] : null;
	
	// Check if any tokens are available
	$: hasAvailableTokens = tokensArray.some(t => hasAvailableSupplySync(t));

	// Extract token data with fallbacks
	$: shareOfAsset = primaryToken?.sharePercentage ? `${primaryToken.sharePercentage}%` : 'TBD';
	
	function handleBuyTokens(tokenAddress?: string) {
		// If a specific token address is provided, use it; otherwise use the first available token
		const targetTokenAddress = tokenAddress || (tokensArray.length > 0 ? tokensArray[0].contractAddress : null);
		dispatch('buyTokens', { 
			assetId: asset.id,
			tokenAddress: targetTokenAddress
		});
	}
	
	// Mobile-responsive class mappings
	$: headerClasses = 'mb-4';
	$: headerMainClasses = 'flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4';
	$: nameLocationClasses = 'flex-1';
	$: operatorClasses = 'flex flex-row sm:flex-col items-center sm:items-end text-left sm:text-right gap-1 sm:gap-0';
	$: operatorLabelClasses = 'text-xs sm:text-sm text-gray-500 font-medium mb-0 sm:mb-1 font-figtree';
	$: operatorNameClasses = 'text-sm sm:text-base text-black font-extrabold font-figtree';
	$: assetNameClasses = 'text-base sm:text-lg lg:text-xl font-extrabold text-black m-0 mb-2 leading-tight text-left font-figtree';
	$: assetLocationClasses = 'text-gray-500 text-sm sm:text-base m-0 text-left font-figtree';
	$: assetDescriptionClasses = 'text-gray-700 text-sm leading-relaxed m-0 mb-4 line-clamp-2 font-figtree lg:line-clamp-3 lg:text-base lg:mb-6';
	$: highlightedStatsClasses = 'grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4 my-3 lg:my-4 p-3 lg:p-4 bg-white rounded-lg';
	$: highlightStatClasses = 'flex flex-col items-center text-center';
	$: highlightValueClasses = 'text-lg sm:text-xl lg:text-2xl font-extrabold text-secondary mb-1 font-figtree';
	$: highlightLabelClasses = 'text-xs lg:text-sm text-gray-500 font-medium font-figtree';
	$: viewDetailsSectionClasses = 'mt-4 lg:mt-6 mb-4 lg:mb-6';
	
	// Token section classes - responsive
	$: tokensSectionClasses = 'mb-4 lg:mb-6';
	$: tokensTitleClasses = 'text-base lg:text-lg font-extrabold text-black m-0 mb-3 lg:mb-4 font-figtree';
	$: tokensListClasses = 'flex flex-col gap-2 lg:gap-3';
	$: tokensListScrollableClasses = 'flex flex-col gap-2 lg:gap-3 max-h-[10rem] lg:max-h-[13rem] overflow-y-auto pr-1 lg:pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400';
	$: tokenButtonClasses = 'flex flex-col sm:flex-row justify-between items-start sm:items-center w-full p-3 lg:p-4 bg-white rounded-none cursor-pointer transition-all duration-200 text-left relative hover:bg-light-gray border border-light-gray hover:shadow-sm hover:-translate-y-0.5 gap-2 sm:gap-0';
	$: tokenButtonLeftClasses = 'flex flex-col gap-1 flex-1';
	$: tokenButtonRightClasses = 'flex flex-row sm:flex-col w-full sm:w-auto justify-between sm:justify-end items-center sm:items-end gap-2';
	$: tokenSymbolClasses = 'font-extrabold text-sm lg:text-base text-black font-figtree';
	$: tokenNameClasses = 'text-xs lg:text-sm text-gray-500 leading-tight font-figtree';
	$: tokenPaymentDateClasses = 'text-xs text-secondary font-medium mt-1 hidden lg:block';
	$: returnsDisplayClasses = 'flex items-center gap-1 lg:gap-2';
	$: returnItemClasses = 'flex flex-col items-center text-center';
	$: returnLabelClasses = 'text-[0.6rem] lg:text-xs text-gray-500 font-medium whitespace-nowrap';
	$: returnValueClasses = 'text-sm lg:text-lg text-primary font-extrabold font-figtree';
	$: returnDividerClasses = 'text-xs lg:text-sm text-gray-500 font-medium mx-1';
	$: buyCtaClasses = 'text-sm lg:text-base font-extrabold text-black font-figtree';

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
			class="{tokensArray.length > 2 ? tokensListScrollableClasses : tokensListClasses}">
				{#each tokensArray as tokenItem}
				{@const sftForToken = $sfts?.find(s => s.id.toLowerCase() === tokenItem.contractAddress.toLowerCase())}
				{@const maxSupplyForToken = catalogService.getTokenMaxSupply(tokenItem.contractAddress) ?? undefined}
				{@const mintedSupplyForToken = sftForToken?.totalShares}
				{@const calculatedReturns = getTokenReturns(asset, tokenItem, mintedSupplyForToken, maxSupplyForToken)}
				{@const baseReturn = calculatedReturns?.baseReturn ? Math.round(calculatedReturns.baseReturn) : 0}
				{@const bonusReturn = calculatedReturns?.bonusReturn ? Math.round(calculatedReturns.bonusReturn) : 0}
				{@const firstPaymentMonth = tokenItem.firstPaymentDate || 'TBD'}
					<button 
						class={tokenButtonClasses} 
						on:click|stopPropagation={() => handleBuyTokens(tokenItem.contractAddress)}
					>
						<!-- Desktop: Full token info -->
						<div class="hidden sm:flex w-full justify-between items-center">
							<div class={tokenButtonLeftClasses}>
								<div class="flex items-center gap-2 w-full">
									<span class={tokenSymbolClasses}>{tokenItem.symbol}</span>
									<span class="text-xs font-extrabold text-white bg-secondary px-2 py-1 tracking-wider rounded-none whitespace-nowrap">{tokenItem.sharePercentage ? `${tokenItem.sharePercentage}%` : shareOfAsset} of Asset</span>
								</div>
								<span class={tokenNameClasses}>{tokenItem.releaseName}</span>
								<span class={tokenPaymentDateClasses}>First payment: {firstPaymentMonth}</span>
							</div>
							<div class={tokenButtonRightClasses}>
								<div class={returnsDisplayClasses}>
									<div class={returnItemClasses}>
										<span class={returnLabelClasses}>Base IRR</span>
										<span class={returnValueClasses}>
											<FormattedReturn value={baseReturn} />
										</span>
									</div>
									<div class={returnDividerClasses}>+</div>
									<div class={returnItemClasses}>
										<span class={returnLabelClasses}>Bonus IRR</span>
										<span class={returnValueClasses}>
											<FormattedReturn value={bonusReturn} />
										</span>
									</div>
								</div>
								<span class={buyCtaClasses}>Buy →</span>
							</div>
						</div>
						
						<!-- Mobile: Simplified token info -->
						<div class="sm:hidden flex justify-between items-center w-full">
							<div class="flex-1">
								<span class={tokenSymbolClasses}>{tokenItem.symbol}</span>
							</div>
							<div class="flex items-center gap-3">
								<div class="text-center">
										<span class="text-sm font-extrabold text-primary">{baseReturn}% Base IRR + {bonusReturn}% Bonus IRR</span>
								</div>
								<span class={buyCtaClasses}>Buy →</span>
							</div>
						</div>
					</button>
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
