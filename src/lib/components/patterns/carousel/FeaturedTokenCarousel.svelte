<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { useCatalogService } from '$lib/services';
	import type { Asset } from '$lib/types/uiTypes';
	import { PrimaryButton, SecondaryButton, FormattedNumber, FormattedReturn } from '$lib/components/components';
	import { sftMetadata, sfts } from '$lib/stores';
	import { formatCurrency, formatTokenSupply, formatSmartReturn, formatSmartNumber } from '$lib/utils/formatters';
	import { formatSupplyAmount, getAvailableSupplyBigInt } from '$lib/utils/tokenSupplyUtils';
    import { getTokenReturns } from '$lib/utils';
    import type { TokenMetadata } from '$lib/types/MetaboardTypes';
    import { getEnergyFieldId } from '$lib/utils/energyFieldGrouping';

	export let autoPlay = true;
	export let autoPlayInterval = 5000;
	
	const dispatch = createEventDispatcher();
	const catalogService = useCatalogService();

	let currentIndex = 0;
	let featuredTokensWithAssets: Array<{ token: TokenMetadata; asset: Asset }> = [];
	let loading = true;
	let error: string | null = null;
	let autoPlayTimer: ReturnType<typeof setTimeout> | null = null;
	let carouselContainer: HTMLElement;
	let isTransitioning = false;
	let touchStartX = 0;
	let touchEndX = 0;

	// Reactive statement to trigger loading when data changes
	$: if($sfts && $sftMetadata && $sfts.length > 0 && $sftMetadata.length > 0) {
		loadFeaturedTokensFromCatalog();
	}

	async function loadFeaturedTokensFromCatalog() {
		try {
			loading = true;
			error = null;
			featuredTokensWithAssets = []; // Reset the array
			
			// Build catalog with all tokens and assets
			await catalogService.build();
			const catalog = catalogService.getCatalog();
			
			if (!catalog) {
				throw new Error('Failed to build catalog');
			}
			
			// Get all tokens and their corresponding assets
			const allTokens = Object.values(catalog.tokens);
			console.log(`[Carousel] Processing ${allTokens.length} tokens`);
			
			for (const token of allTokens) {
				// Find corresponding asset
				const assetKey = Object.keys(catalog.assets).find(key => {
					const asset = catalog.assets[key];
					return asset.tokenContracts?.includes(token.contractAddress);
				});
				
				if (assetKey) {
					const asset = catalog.assets[assetKey];
					// Only add tokens with available supply
					const availableSupply = getAvailableSupplyBigInt(token);
					console.log(`[Carousel] Token ${token.symbol}: has asset ${assetKey}, available supply = ${availableSupply}`);
					if (availableSupply > 0n) {
						featuredTokensWithAssets.push({ token, asset });
					}
				} else {
					console.log(`[Carousel] Token ${token.symbol} (${token.contractAddress}): NO MATCHING ASSET FOUND`);
				}
			}
			
			if (autoPlay && featuredTokensWithAssets.length > 1) {
				startAutoPlay();
			}
			
			loading = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load featured tokens';
			loading = false;
			// Set empty array to show "no tokens" message instead of spinner
			featuredTokensWithAssets = [];
		}
	}

	onDestroy(() => {
		if (autoPlayTimer) {
			clearInterval(autoPlayTimer);
		}
	});

	function nextSlide() {
		if (featuredTokensWithAssets.length === 0 || isTransitioning) return;
		isTransitioning = true;
		currentIndex = (currentIndex + 1) % featuredTokensWithAssets.length;
		setTimeout(() => {
			isTransitioning = false;
		}, 600);
	}

	function prevSlide() {
		if (featuredTokensWithAssets.length === 0 || isTransitioning) return;
		isTransitioning = true;
		currentIndex = currentIndex === 0 ? featuredTokensWithAssets.length - 1 : currentIndex - 1;
		setTimeout(() => {
			isTransitioning = false;
		}, 600);
	}

	function goToSlide(index: number) {
		if (index >= 0 && index < featuredTokensWithAssets.length && !isTransitioning) {
			isTransitioning = true;
			currentIndex = index;
			setTimeout(() => {
				isTransitioning = false;
			}, 600);
		}
	}

	function startAutoPlay() {
		if (autoPlayTimer) clearInterval(autoPlayTimer);
		autoPlayTimer = setInterval(nextSlide, autoPlayInterval);
	}

	function stopAutoPlay() {
		if (autoPlayTimer) {
			clearInterval(autoPlayTimer);
			autoPlayTimer = null;
		}
	}

	function handleMouseEnter() {
		if (autoPlay) stopAutoPlay();
	}

	function handleMouseLeave() {
		if (autoPlay && featuredTokensWithAssets.length > 1) startAutoPlay();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (featuredTokensWithAssets.length <= 1) return;
		
		switch (event.key) {
			case 'ArrowLeft':
				event.preventDefault();
				prevSlide();
				break;
			case 'ArrowRight':
				event.preventDefault();
				nextSlide();
				break;
			case 'Home':
				event.preventDefault();
				goToSlide(0);
				break;
			case 'End':
				event.preventDefault();
				goToSlide(featuredTokensWithAssets.length - 1);
				break;
		}
	}

	function handleTouchStart(event: TouchEvent) {
		touchStartX = event.touches[0].clientX;
	}

	function handleTouchEnd(event: TouchEvent) {
		touchEndX = event.changedTouches[0].clientX;
		handleSwipe();
	}

	function handleSwipe() {
		const swipeThreshold = 50;
		const difference = touchStartX - touchEndX;
		
		if (Math.abs(difference) > swipeThreshold) {
			if (difference > 0) {
				nextSlide();
			} else {
				prevSlide();
			}
		}
	}
	
	function handleBuyTokens(tokenAddress: string) {
		dispatch('buyTokens', { tokenAddress });
	}



	function formatLargeNumber(value: number): string {
		if (value >= 1000000) {
			return `${(value / 1000000).toFixed(1)}M`;
		}
		if (value >= 1000) {
			return `${(value / 1000).toFixed(1)}K`;
		}
		return value.toString();
	}

	function formatSupply(supply: string, decimals: number): string {
		const formatted = formatSupplyAmount(supply, decimals);
		return formatTokenSupply(formatted);
	}

	$: currentItem = featuredTokensWithAssets[currentIndex];
	
	// Enhanced Tailwind class mappings with better mobile responsiveness - FIXED
	$: containerClasses = 'relative w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8';
	$: loadingStateClasses = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center p-8 lg:p-16 text-black bg-white border border-light-gray rounded-lg';
	$: errorStateClasses = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center p-8 lg:p-16 text-black bg-white border border-light-gray rounded-lg';
	$: emptyStateClasses = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center p-8 lg:p-16 text-black bg-white border border-light-gray rounded-lg';
	$: spinnerClasses = 'w-8 h-8 border-4 border-light-gray border-t-primary animate-spin mb-4';
	$: retryButtonClasses = 'mt-4 px-6 py-3 bg-primary text-white border-none cursor-pointer font-semibold transition-colors duration-200 hover:bg-secondary touch-target rounded';
	$: carouselWrapperClasses = 'relative overflow-hidden rounded-lg outline-none focus:ring-4 focus:ring-primary/50 touch-pan-y';
	$: carouselTrackClasses = 'flex w-full transition-transform duration-500 ease-in-out will-change-transform';
	$: carouselSlideClasses = 'flex-shrink-0 w-full relative';
	$: activeSlideClasses = 'opacity-100';
	$: inactiveSlideClasses = 'opacity-100';
	$: bannerCardClasses = 'grid grid-cols-1 lg:grid-cols-2 bg-white border border-light-gray overflow-hidden';
	$: tokenSectionClasses = 'p-4 sm:p-6 lg:p-8 bg-white border-b lg:border-b-0 lg:border-r border-light-gray flex flex-col justify-between min-h-[300px] sm:min-h-[350px] lg:min-h-[400px]';
	$: assetSectionClasses = 'p-4 sm:p-6 lg:p-8 bg-light-gray flex flex-col justify-between min-h-[300px] sm:min-h-[350px] lg:min-h-[400px] hidden lg:flex';
	$: tokenHeaderClasses = 'mb-3 sm:mb-4 lg:mb-6';
	$: tokenNameClasses = 'text-lg sm:text-xl lg:text-2xl font-bold text-black tracking-wider mb-2 leading-tight text-left';
	$: tokenContractClasses = 'text-xs sm:text-sm font-medium text-secondary break-all leading-relaxed py-1 opacity-80 tracking-tight font-figtree text-left';
	$: assetHeaderClasses = 'mb-3 sm:mb-4 lg:mb-6';
	$: assetStatusClasses = 'flex items-center gap-2 mb-2';
	$: statusIndicatorClasses = 'w-2 h-2 bg-secondary rounded-full';
	$: statusIndicatorProducingClasses = 'w-2 h-2 bg-green-500 rounded-full animate-pulse';
	$: statusIndicatorFundingClasses = 'w-2 h-2 bg-yellow-500 rounded-full';
	$: statusIndicatorCompletedClasses = 'w-2 h-2 bg-secondary rounded-full';
	$: statusTextClasses = 'text-xs sm:text-sm font-medium text-black font-figtree uppercase tracking-wide';
	$: assetNameClasses = 'text-lg sm:text-xl lg:text-2xl font-bold text-black mb-2 leading-tight text-left';
	$: assetLocationClasses = 'text-sm sm:text-base text-black leading-relaxed font-figtree text-left opacity-80';
	$: assetDescriptionClasses = 'text-sm text-black leading-relaxed mb-4 sm:mb-6 font-figtree hidden lg:block';
	$: tokenStatsClasses = 'grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6 lg:mb-8';
	$: assetStatsClasses = 'grid grid-cols-1 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6 lg:mb-8';
	$: statItemClasses = 'text-left';
	$: statLabelClasses = 'text-xs font-medium text-gray-500 mb-1 font-figtree uppercase tracking-wide';
	$: statValueClasses = 'text-sm sm:text-base lg:text-lg font-bold text-black';
	$: tokenActionsClasses = 'flex flex-col gap-2 sm:gap-3 mt-auto';
	$: assetMetaClasses = 'flex flex-col gap-2 mt-auto';
	$: assetMetaItemClasses = 'flex gap-2';
	$: assetMetaLabelClasses = 'text-xs font-medium text-gray-500 font-figtree';
	$: assetMetaValueClasses = 'text-xs text-black opacity-70 font-figtree';
	
	// Navigation controls - hidden on mobile, shown on desktop
	$: navButtonClasses = 'hidden lg:flex absolute top-1/2 transform -translate-y-1/2 w-12 h-12 bg-black/70 text-white border-none text-xl cursor-pointer transition-all duration-200 z-10 hover:bg-black hover:scale-110 hover:shadow-lg touch-target items-center justify-center rounded-full';
	$: prevButtonClasses = 'hidden lg:flex absolute top-1/2 transform -translate-y-1/2 w-12 h-12 bg-black/70 text-white border-none text-xl cursor-pointer transition-all duration-200 z-10 hover:bg-black hover:scale-110 hover:shadow-lg touch-target left-[-4rem] items-center justify-center rounded-full';
	$: nextButtonClasses = 'hidden lg:flex absolute top-1/2 transform -translate-y-1/2 w-12 h-12 bg-black/70 text-white border-none text-xl cursor-pointer transition-all duration-200 z-10 hover:bg-black hover:scale-110 hover:shadow-lg touch-target right-[-4rem] items-center justify-center rounded-full';

	
	// Get status-specific classes
	function getStatusIndicatorClasses(status: string) {
		switch (status) {
			case 'producing':
				return statusIndicatorProducingClasses;
			case 'funding':
				return statusIndicatorFundingClasses;
			case 'completed':
				return statusIndicatorCompletedClasses;
			default:
				return statusIndicatorClasses;
		}
	}
</script>

<div class={containerClasses} bind:this={carouselContainer}>
	{#if loading}
		<div class={loadingStateClasses}>
			<div class={spinnerClasses}></div>
			<p>Loading featured tokens...</p>
		</div>
	{:else if error}
		<div class={errorStateClasses}>
			<p>Error: {error}</p>
			<button on:click={loadFeaturedTokensFromCatalog} class={retryButtonClasses}>Retry</button>
		</div>
	{:else if featuredTokensWithAssets.length === 0}
		<div class={emptyStateClasses}>
			<p>No featured tokens available</p>
		</div>
	{:else}
		<!-- Navigation Controls (outside carousel wrapper) -->
		{#if featuredTokensWithAssets.length > 1}
			<button 
				class={prevButtonClasses} 
				on:click={prevSlide}
				aria-label="Previous token"
			>
				‹
			</button>
			
			<button 
				class={nextButtonClasses} 
				on:click={nextSlide}
				aria-label="Next token"
			>
				›
			</button>
		{/if}

		<div 
			class={carouselWrapperClasses}
			on:mouseenter={handleMouseEnter}
			on:mouseleave={handleMouseLeave}
			on:keydown={handleKeydown}
			on:touchstart={handleTouchStart}
			on:touchend={handleTouchEnd}
			role="button"
			aria-label="Featured tokens carousel - use arrow keys to navigate"
			tabindex="0"
		>
			<!-- Carousel track -->
			<div 
				class={carouselTrackClasses}
				style="transform: translateX(-{currentIndex * 100}%)"
			>
				{#each featuredTokensWithAssets as item, index}
					{@const calculatedReturns = getTokenReturns(item.asset, item.token)}
					<div class="{carouselSlideClasses} {index === currentIndex ? activeSlideClasses : inactiveSlideClasses}">
						<div class={bannerCardClasses}>
							<!-- Token Section -->
							<div class={tokenSectionClasses}>
								<!-- Mobile: Image at the top -->
								{#if item.asset.coverImage}
									<div class="lg:hidden mb-4 -mx-4 -mt-4">
										<img 
											src={item.asset.coverImage} 
											alt={item.asset.name}
											class="w-full h-40 object-cover"
											loading="lazy"
										/>
									</div>
								{/if}
								
								<div class={tokenHeaderClasses}>
									<div class="mb-3">
										<h3 class={tokenNameClasses}>{item.token.releaseName}</h3>
									</div>
									<div class={tokenContractClasses}>{item.token.contractAddress}</div>
								</div>

												<div class={tokenStatsClasses}>
					<!-- Total Supply - hidden on mobile -->
					<div class="{statItemClasses} hidden sm:block">
						<div class={statLabelClasses}>Total Supply</div>
						<div class={statValueClasses}>
							<FormattedNumber 
								value={formatSupplyAmount(item.token.supply.maxSupply, item.token.decimals)} 
								type="token"
							/>
						</div>
					</div>

					<!-- Available Supply - always shown -->
					<div class={statItemClasses}>
						<div class={statLabelClasses}>Available Supply</div>
						<div class={statValueClasses}>
							<FormattedNumber 
								value={formatSupplyAmount(getAvailableSupplyBigInt(item.token).toString(), item.token.decimals)} 
								type="token"
							/>
						</div>
					</div>

					<!-- Returns - responsive label and format -->
					<div class={statItemClasses}>
						<div class={statLabelClasses}>
							<span class="hidden sm:inline">Base Returns</span>
							<span class="sm:hidden">Est. Return</span>
						</div>
						<div class={statValueClasses + ' text-primary'}>
							<span class="hidden sm:inline">
								<FormattedReturn value={calculatedReturns?.baseReturn} />
							</span>
							<span class="sm:hidden flex items-center gap-1">
								{#if calculatedReturns?.baseReturn !== undefined && calculatedReturns?.bonusReturn !== undefined}
									<span class="flex items-center gap-1 text-xs">
										<FormattedReturn value={calculatedReturns.baseReturn} />
										<span>+</span>
										<FormattedReturn value={calculatedReturns.bonusReturn} />
									</span>
								{:else}
									TBD
								{/if}
							</span>
						</div>
					</div>

					<!-- Bonus Returns - hidden on mobile -->
					<div class="{statItemClasses} hidden sm:block">
						<div class={statLabelClasses}>Bonus Returns</div>
						<div class={statValueClasses + ' text-primary'}>
							<FormattedReturn value={calculatedReturns?.bonusReturn} showPlus={true} />
						</div>
					</div>
				</div>

												<div class={tokenActionsClasses + " sm:flex-col flex-row gap-2 sm:gap-4"}>
					<PrimaryButton on:click={() => handleBuyTokens(item.token.contractAddress)}>
						Buy Tokens
					</PrimaryButton>
					<SecondaryButton href="/assets/{getEnergyFieldId(item.token.contractAddress)}" >
						View Asset
					</SecondaryButton>
				</div>
							</div>

							<!-- Asset Section -->
							<div class={assetSectionClasses}>
								<!-- Cover Image at the top -->
								{#if item.asset.coverImage}
									<div class="mb-4 lg:mb-6 -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 lg:-mt-8">
										<img 
											src={item.asset.coverImage} 
											alt={item.asset.name}
											class="w-full h-32 sm:h-40 lg:h-48 object-cover"
											loading="lazy"
										/>
									</div>
								{/if}

												<!-- Desktop: Full asset info -->
				<div class="hidden sm:block">
					<div class={assetHeaderClasses}>
						<div class="flex items-center gap-2 mb-2">
							<div class={getStatusIndicatorClasses(item.asset.production.status)}></div>
							<span class={statusTextClasses}>{item.asset.production.status.toUpperCase()}</span>
						</div>
						<h3 class={assetNameClasses}>{item.asset.name}</h3>
						<div class={assetLocationClasses}>
							{item.asset.location.state}, {item.asset.location.country}
						</div>
					</div>

					<div class={assetStatsClasses}>
						<div class={statItemClasses}>
							<div class={statLabelClasses}>Remaining Production</div>
							<div class={statValueClasses}>{item.asset.plannedProduction?.projections.reduce((acc, curr) => acc + curr.production, 0) ? formatSmartNumber(item.asset.plannedProduction.projections.reduce((acc, curr) => acc + curr.production, 0), { suffix: ' boe' }) : 'TBD'}</div>
						</div>
					</div>

					<div class={assetMetaClasses}>
						<div class={assetMetaItemClasses}>
							<span class={assetMetaLabelClasses}>Operator:</span>
							<span class={assetMetaValueClasses}>{item.asset.operator.name}</span>
						</div>
					</div>
				</div>
				
				<!-- Mobile: Simplified asset info -->
				<div class="sm:hidden">
					<h3 class={assetNameClasses}>{item.asset.name}</h3>
					<div class="text-sm text-black opacity-70">
						<span class="font-medium">Remaining Production:</span> 
						<span>{item.asset.plannedProduction?.projections.reduce((acc, curr) => acc + curr.production, 0) ? formatSmartNumber(item.asset.plannedProduction.projections.reduce((acc, curr) => acc + curr.production, 0), { suffix: ' boe' }) : 'TBD'}</span>
					</div>
				</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

		</div>
		
		<!-- Indicators below carousel (both mobile and desktop) -->
		{#if featuredTokensWithAssets.length > 1}
			<div class="flex justify-center gap-1 mt-2 z-10">
				{#each featuredTokensWithAssets as _, index}
					<div 
						class="{index === currentIndex ? 'w-2 h-2 bg-gray-800 rounded-full' : 'w-2 h-2 bg-gray-300 rounded-full'}"
					></div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

