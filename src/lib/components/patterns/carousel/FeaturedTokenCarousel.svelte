<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { useCatalogService } from '$lib/services';
	import type { Asset } from '$lib/types/uiTypes';
	import { PrimaryButton, SecondaryButton, FormattedNumber, FormattedReturn } from '$lib/components/components';
	import { sftMetadata, sfts } from '$lib/stores';
	import { chainId } from 'svelte-wagmi';
	import { formatSmartNumber } from '$lib/utils/formatters';
	import { formatSupplyDisplay } from '$lib/utils/supplyHelpers';
	import { calculateTokenReturns } from '$lib/utils';
	import type { TokenMetadata } from '$lib/types/MetaboardTypes';
	import { getEnergyFieldId } from '$lib/utils/energyFieldGrouping';
	import { getAddressUrl } from '$lib/utils/explorer';
	import { calculateLifetimeIRR, calculateMonthlyTokenCashflows, calculateIRR } from '$lib/utils/returnsCalculatorHelpers';
	import ReturnsCalculatorModal from '$lib/components/patterns/ReturnsCalculatorModal.svelte';

	export let autoPlay = true;
	export let autoPlayInterval = 5000;
	
	const dispatch = createEventDispatcher();
	const catalogService = useCatalogService();
	const isDev = import.meta.env.DEV;
	const logDev = (...messages: unknown[]) => {
		if (isDev) console.warn('[FeaturedTokenCarousel]', ...messages);
	};

	let currentIndex = 0;
	let featuredTokensWithAssets: Array<{ token: TokenMetadata; asset: Asset }> = [];
	let loading = true;
	let error: string | null = null;
	let autoPlayTimer: ReturnType<typeof setTimeout> | null = null;
	let carouselContainer: HTMLElement;
	let isTransitioning = false;
	let touchStartX = 0;
	let touchEndX = 0;

	// Returns calculator modal state
	let showReturnsCalculator = false;
	let calculatorToken: TokenMetadata | null = null;
	let calculatorMintedSupply = 0;
	let calculatorAvailableSupply = 0;

	// Calculate supply values for a token
	function getTokenSupplyValues(token: TokenMetadata) {
		const sft = $sfts?.find((item) => item.id.toLowerCase() === token.contractAddress.toLowerCase());
		const maxSupply = catalogService.getTokenMaxSupply(token.contractAddress) ?? undefined;

		if (sft && maxSupply) {
			const totalShares = BigInt(sft.totalShares);
			const maxSupplyBig = BigInt(maxSupply);
			const availableSupplyBig = maxSupplyBig > totalShares ? maxSupplyBig - totalShares : 0n;

			return {
				maxSupply: formatSupplyDisplay(maxSupply),
				mintedSupply: formatSupplyDisplay(sft.totalShares),
				availableSupply: formatSupplyDisplay(availableSupplyBig.toString())
			};
		}

		return {
			maxSupply: 0,
			mintedSupply: 0,
			availableSupply: 0,
		};
	}

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
			logDev(`Processing ${allTokens.length} tokens`);
			
			for (const token of allTokens) {
				// Find corresponding asset
				const assetKey = Object.keys(catalog.assets).find(key => {
					const asset = catalog.assets[key];
					return asset.tokenContracts?.includes(token.contractAddress);
				});
				
				if (assetKey) {
					const asset = catalog.assets[assetKey];
					// Check if token has available supply using real maxSupply data
					const sft = $sfts?.find(s => s.id.toLowerCase() === token.contractAddress.toLowerCase());
					const maxSupply = catalogService.getTokenMaxSupply(token.contractAddress) ?? undefined;
					let hasAvailable = false;

					if (sft && maxSupply) {
						const totalShares = BigInt(sft.totalShares);
						const maxSupplyBig = BigInt(maxSupply);
						hasAvailable = totalShares < maxSupplyBig;
						logDev(
							`Token ${token.symbol}: totalShares=${sft.totalShares}, maxSupply=${maxSupply}, available=${maxSupplyBig - totalShares}, hasAvailable=${hasAvailable}`,
						);
					} else {
						// Fallback to heuristic if no maxSupply data
						if (sft) {
							const totalShares = BigInt(sft.totalShares);
							const reasonableMax = BigInt('1000000000000000000000000000'); // 1B tokens in wei
							hasAvailable = totalShares < reasonableMax;
						}
						logDev(`Token ${token.symbol}: using fallback heuristic, hasAvailable=${hasAvailable}`);
					}

					if (hasAvailable) {
						featuredTokensWithAssets.push({ token, asset });
					}
				} else {
					logDev(`Token ${token.symbol} (${token.contractAddress}): no matching asset found`);
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

	function _goToSlide(index: number) {
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


	// Enhanced Tailwind class mappings with better mobile responsiveness - FIXED
	const containerClasses = 'relative w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8';
	const loadingStateClasses = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center p-8 lg:p-16 text-black bg-white border border-light-gray rounded-lg';
	const errorStateClasses = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center p-8 lg:p-16 text-black bg-white border border-light-gray rounded-lg';
	const emptyStateClasses = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center p-8 lg:p-16 text-black bg-white border border-light-gray rounded-lg';
	const spinnerClasses = 'w-8 h-8 border-4 border-light-gray border-t-primary animate-spin mb-4';
	const retryButtonClasses = 'mt-4 px-6 py-3 bg-primary text-white border-none cursor-pointer font-semibold transition-colors duration-200 hover:bg-secondary touch-target rounded';
	const carouselWrapperClasses = 'relative overflow-hidden rounded-lg outline-none focus:ring-4 focus:ring-primary/50 touch-pan-y';
	const carouselTrackClasses = 'flex w-full transition-transform duration-500 ease-in-out will-change-transform';
	const carouselSlideClasses = 'flex-shrink-0 w-full relative';
	const activeSlideClasses = 'opacity-100';
	const inactiveSlideClasses = 'opacity-100';
	const bannerCardClasses = 'grid grid-cols-1 lg:grid-cols-2 bg-white border border-light-gray overflow-hidden';
	const tokenSectionClasses = 'p-4 sm:p-6 lg:p-8 bg-white border-b lg:border-b-0 lg:border-r border-light-gray flex flex-col justify-between min-h-[300px] sm:min-h-[350px] lg:min-h-[400px]';
	const assetSectionClasses = 'p-4 sm:p-6 lg:p-8 bg-light-gray flex flex-col justify-between min-h-[300px] sm:min-h-[350px] lg:min-h-[400px] hidden lg:flex';
	const tokenHeaderClasses = 'mb-3 sm:mb-4 lg:mb-6';
	const tokenNameClasses = 'text-lg sm:text-xl lg:text-2xl font-bold text-black tracking-wider mb-2 leading-tight text-left';
	const tokenContractClasses = 'text-xs sm:text-sm font-medium text-secondary break-all leading-relaxed py-1 opacity-80 tracking-tight font-figtree text-left';
	const assetHeaderClasses = 'mb-3 sm:mb-4 lg:mb-6';
	const statusIndicatorClasses = 'w-2 h-2 bg-secondary rounded-full';
	const statusIndicatorProducingClasses = 'w-2 h-2 bg-green-500 rounded-full animate-pulse';
	const statusIndicatorFundingClasses = 'w-2 h-2 bg-yellow-500 rounded-full';
	const statusIndicatorCompletedClasses = 'w-2 h-2 bg-secondary rounded-full';
	const statusTextClasses = 'text-xs sm:text-sm font-medium text-black font-figtree uppercase tracking-wide';
	const assetNameClasses = 'text-lg sm:text-xl lg:text-2xl font-bold text-black mb-2 leading-tight text-left';
	const assetLocationClasses = 'text-sm sm:text-base text-black leading-relaxed font-figtree text-left opacity-80';
	const tokenStatsClasses = 'grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6 lg:mb-8';
	const assetStatsClasses = 'grid grid-cols-1 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6 lg:mb-8';
	const statItemClasses = 'text-left';
	const statLabelClasses = 'text-xs font-medium text-gray-500 mb-1 font-figtree uppercase tracking-wide';
	const statValueClasses = 'text-sm sm:text-base lg:text-lg font-bold text-black';
	const tokenActionsClasses = 'flex flex-col gap-2 sm:gap-3 mt-auto';
	const assetMetaClasses = 'flex flex-col gap-2 mt-auto';
	const assetMetaItemClasses = 'flex gap-2';
	const assetMetaLabelClasses = 'text-xs font-medium text-gray-500 font-figtree';
	const assetMetaValueClasses = 'text-xs text-black opacity-70 font-figtree';

	// Navigation controls - hidden on mobile, shown on desktop
	const prevButtonClasses = 'hidden lg:flex absolute top-1/2 transform -translate-y-1/2 w-12 h-12 bg-black/70 text-white border-none text-xl cursor-pointer transition-all duration-200 z-10 hover:bg-black hover:scale-110 hover:shadow-lg touch-target left-[-4rem] items-center justify-center rounded-full';
	const nextButtonClasses = 'hidden lg:flex absolute top-1/2 transform -translate-y-1/2 w-12 h-12 bg-black/70 text-white border-none text-xl cursor-pointer transition-all duration-200 z-10 hover:bg-black hover:scale-110 hover:shadow-lg touch-target right-[-4rem] items-center justify-center rounded-full';

	
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

	// Open returns calculator modal
	function openReturnsCalculator(token: TokenMetadata, mintedSupply: number, availableSupply: number) {
		calculatorToken = token;
		calculatorMintedSupply = mintedSupply;
		calculatorAvailableSupply = availableSupply;
		showReturnsCalculator = true;
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
			on:touchstart={handleTouchStart}
			on:touchend={handleTouchEnd}
			role="region"
			aria-label="Featured tokens carousel"
		>
			<!-- Carousel track -->
			<div 
				class={carouselTrackClasses}
				style="transform: translateX(-{currentIndex * 100}%)"
			>
				{#each featuredTokensWithAssets as item, index (item.token.contractAddress)}
					{@const sft = $sfts?.find(s => s.id.toLowerCase() === item.token.contractAddress.toLowerCase())}
					{@const maxSupply = catalogService.getTokenMaxSupply(item.token.contractAddress) ?? undefined}
					{@const _calculatedReturns = calculateTokenReturns(item.asset, item.token, sft?.totalShares, maxSupply)}
					{@const supplyValues = getTokenSupplyValues(item.token)}
					{@const lifetimeIRR = calculateLifetimeIRR(item.token, 65, supplyValues.mintedSupply, 1)}
					{@const monthlyCashflows = calculateMonthlyTokenCashflows(item.token, 65, supplyValues.mintedSupply, 1)}
					{@const cashflows = monthlyCashflows.map(m => m.cashflow)}
					{@const monthlyIRR = calculateIRR(cashflows)}
					{@const remainingIRR = monthlyIRR > -0.99 ? (Math.pow(1 + monthlyIRR, 12) - 1) * 100 : -99}
					<div class={`${carouselSlideClasses} ${index === currentIndex ? activeSlideClasses : inactiveSlideClasses}`}>
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
									<a
										href={getAddressUrl(item.token.contractAddress, $chainId)}
										target="_blank"
										rel="noopener noreferrer"
										class={tokenContractClasses + " no-underline hover:text-primary transition-colors"}
										on:click|stopPropagation
									>
										{item.token.contractAddress}
									</a>
								</div>

												<div class={tokenStatsClasses}>
					<!-- Total Supply - hidden on mobile -->
					<div class={`${statItemClasses} hidden sm:block`}>
						<div class={statLabelClasses}>Total Supply</div>
						<div class={statValueClasses}>
							<FormattedNumber
								value={supplyValues.maxSupply}
								type="token"
							/>
						</div>
					</div>

					<!-- Available Supply - always shown -->
					<div class={statItemClasses}>
						<div class={statLabelClasses}>Available Supply</div>
						<div class={statValueClasses}>
							<FormattedNumber
								value={supplyValues.availableSupply}
								type="token"
							/>
						</div>
					</div>

		<!-- Lifetime Returns -->
		<div class={statItemClasses}>
			<div class={statLabelClasses}>Lifetime Returns</div>
			<div class={statValueClasses + ' text-primary'}>
				<FormattedReturn value={lifetimeIRR} />
			</div>
			<button
				class="text-xs font-semibold text-primary hover:text-secondary transition-colors cursor-pointer bg-transparent border-none p-0 mt-1 text-left"
				on:click={() => openReturnsCalculator(item.token, supplyValues.mintedSupply, supplyValues.availableSupply)}
			>
				View returns estimator →
			</button>
		</div>

		<!-- Remaining Returns -->
		<div class={statItemClasses}>
			<div class={statLabelClasses}>Remaining Returns</div>
			<div class={statValueClasses + ' text-primary'}>
				<FormattedReturn value={remainingIRR} />
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
							<div class={getStatusIndicatorClasses(item.asset.status)}></div>
							<span class={statusTextClasses}>{item.asset.status.toUpperCase()}</span>
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
				{#each featuredTokensWithAssets as indicatorItem, index (indicatorItem.token.contractAddress)}
					<div
						class={index === currentIndex ? 'w-2 h-2 bg-gray-800 rounded-full' : 'w-2 h-2 bg-gray-300 rounded-full'}
					></div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<!-- Returns Calculator Modal -->
{#if calculatorToken}
	<ReturnsCalculatorModal
		bind:isOpen={showReturnsCalculator}
		token={calculatorToken}
		mintedSupply={calculatorMintedSupply}
		availableSupply={calculatorAvailableSupply}
	/>
{/if}
