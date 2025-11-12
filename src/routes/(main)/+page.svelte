<script lang="ts">
	import { onMount } from 'svelte';
	import { usePlatformStats } from '$lib/composables/usePlatformStats';
	import FeaturedTokenCarousel from '$lib/components/patterns/carousel/FeaturedTokenCarousel.svelte';
	import TokenPurchaseWidget from '$lib/components/patterns/TokenPurchaseWidget.svelte';
	import { PrimaryButton, SecondaryButton, StatsCard } from '$lib/components/components';
	import SectionTitle from '$lib/components/components/SectionTitle.svelte';
	import { PageLayout, HeroSection, ContentSection } from '$lib/components/layout';
	import { marketDataService, type MarketData } from '$lib/services/MarketDataService';
	import { connected, web3Modal } from 'svelte-wagmi';

	// Composables
	const { platformStats, formattedStats: sftsFormattedStats } = usePlatformStats();
	
	// Market data state
	let marketData: MarketData | null = null;
	let marketDataLoading = true;
	
	// Token purchase widget state
	let showPurchaseWidget = false;
	let selectedTokenAddress: string | null = null;
	let selectedAssetId: string | null = null;
	
	async function handleBuyTokensFromCarousel(event: CustomEvent) {
		// Check if wallet is connected, if not prompt user to connect
		if (!$connected) {
			await $web3Modal.open();
			return;
		}

		selectedTokenAddress = event.detail.tokenAddress;
		selectedAssetId = null;
		showPurchaseWidget = true;
	}
	
	function handlePurchaseSuccess(_event: CustomEvent) {
		// Purchase successful - could add user notification here
		showPurchaseWidget = false;
	}
	
	function handleWidgetClose() {
		showPurchaseWidget = false;
		selectedTokenAddress = null;
		selectedAssetId = null;
	}

	// Load market data on component mount
	onMount(async () => {
		try {
			marketData = await marketDataService.getMarketData();
		} catch (error) {
			console.error('Failed to load market data:', error);
		} finally {
			marketDataLoading = false;
		}
	});
</script>

<svelte:head>
	<title>Albion - Institutional Grade Energy DeFi</title>
	<meta name="description" content="Real-world energy assets. Tokenized ownership. Transparent operations. Access institutional-quality energy investments through blockchain technology." />
</svelte:head>

<PageLayout>
	<!-- Hero Section -->
	<HeroSection 
		title="Institutional Grade Energy DeFi"
		subtitle="Real-world energy assets. Tokenized ownership. Transparent operations. Access institutional-quality energy investments through blockchain technology."
		showBorder={true}
		showButtons={false}
	>
		<!-- Buttons Below Hero -->
		<div class="flex flex-col sm:flex-row gap-4 justify-center mt-6 sm:mt-8">
			<PrimaryButton href="/assets">Explore Investments</PrimaryButton>
			<SecondaryButton href="/about">Learn How It Works</SecondaryButton>
		</div>
	</HeroSection>

	<!-- Platform Stats - 3 columns on all viewports -->
	<ContentSection background="white" padding="compact">
		<div class="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-8 text-center">
		{#if $platformStats.loading}
			<StatsCard
				title="Total Invested"
				value="--"
				subtitle="Loading..."
				size="large"
			/>
			<StatsCard
				title="Assets"
				value="--"
				subtitle="Loading..."
				size="large"
			/>
			<StatsCard
				title="Active Investors"
				value="--"
				subtitle="Loading..."
				size="small"
			/>
		{:else}
			<StatsCard
				title="Total Invested"
				value={$sftsFormattedStats.totalInvested}
				subtitle="this month"
				trend={$sftsFormattedStats.growthTrend}
				size="small"
				valueColor="primary"
			/>
			<StatsCard
				title="Assets"
				value={$sftsFormattedStats.totalAssets}
				subtitle={$sftsFormattedStats.regionsText}
				size="small"
			/>
			<StatsCard
				title="Active Investors"
				value={$sftsFormattedStats.activeInvestors}
				subtitle="Token holders"
				size="small"
			/>
		{/if}
		</div>
	</ContentSection>

	<!-- Featured Tokens Carousel -->
	<ContentSection background="white" padding="standard" centered>
		<SectionTitle level="h2" size="section" center className="mb-6">Featured Token Releases</SectionTitle>
		<FeaturedTokenCarousel autoPlay={true} autoPlayInterval={6000} on:buyTokens={handleBuyTokensFromCarousel} />
	</ContentSection>

	<!-- Mobile CTA Section -->
	<ContentSection background="gray" padding="compact" centered className="block sm:hidden">
		<div class="text-center">
			<SectionTitle level="h2" size="section" className="mb-4">Ready to Start?</SectionTitle>
			<p class="text-sm text-black mb-6">Browse available investment opportunities and start earning from energy assets.</p>
			<PrimaryButton href="/assets" fullWidth>View All Investments</PrimaryButton>
		</div>
	</ContentSection>

	<!-- How It Works - Simplified for mobile -->
	<ContentSection background="gray" padding="standard" centered className="hidden sm:block">
		<SectionTitle level="h2" size="section" center className="mb-6 lg:mb-8">How It Works</SectionTitle>
			
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
			<div class="text-center">
				<div class="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center text-2xl font-extrabold mx-auto mb-6">1</div>
				<SectionTitle level="h3" size="small" className="mb-4">Browse Assets</SectionTitle>
				<p class="text-sm sm:text-base text-black">Explore energy assets with transparent production and revenue data from established operators.</p>
			</div>
			
			<div class="text-center">
				<div class="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center text-2xl font-extrabold mx-auto mb-6">2</div>
				<SectionTitle level="h3" size="small" className="mb-4">Buy Tokens</SectionTitle>
				<p class="text-sm sm:text-base text-black">Purchase smart contract-powered royalty tokens entitling you to a share of real energy asset revenue.</p>
			</div>
			
			<div class="text-center sm:col-span-2 lg:col-span-1">
				<div class="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center text-2xl font-extrabold mx-auto mb-6">3</div>
				<SectionTitle level="h3" size="small" className="mb-4">Earn Revenue Payouts</SectionTitle>
				<p class="text-sm sm:text-base text-black">Receive regular stablecoin distributions directly to your wallet. Transparent payouts and accounting.</p>
			</div>
		</div>
	</ContentSection>

	<!-- Trust Indicators - Hidden on mobile -->
	<ContentSection background="white" padding="standard" centered className="hidden lg:block">
		<SectionTitle level="h2" size="section" center className="mb-6 lg:mb-8">Built for Trust & Performance</SectionTitle>
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
			<div class="flex flex-col items-center text-center">
				<div class="mb-4 lg:mb-6 text-black flex items-center justify-center w-16 h-16 lg:w-20 lg:h-20 relative">
					<!-- Shield with checkmark for regulation -->
					<svg width="48" height="48" class="lg:w-16 lg:h-16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M24 4L8 12V24C8 33 13 41 24 44C35 41 40 33 40 24V12L24 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
						<path d="M16 24L21 29L32 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</div>
				<SectionTitle level="h3" size="small" className="mb-2 text-xs sm:text-sm lg:text-base">Germany Regulated</SectionTitle>
				<p class="text-xs text-black opacity-70">Full regulatory compliance with EU laws</p>
			</div>
			
			<div class="flex flex-col items-center text-center">
				<div class="mb-4 lg:mb-6 text-black flex items-center justify-center w-16 h-16 lg:w-20 lg:h-20 relative">
					<!-- Energy production assets - wind turbine, solar panel, and oil derrick -->
					<svg width="48" height="48" class="lg:w-16 lg:h-16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
						<!-- Wind turbine (left) -->
						<path d="M8 44V28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						<circle cx="8" cy="28" r="1.5" stroke="currentColor" stroke-width="2"/>
						<path d="M8 28L8 22M8 28L14 34M8 28L2 34" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						
						<!-- Solar panel (angled/perspective view) -->
						<path d="M16 36L32 32L32 38L16 42Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
						<path d="M20 35L20 41M24 34L24 40M28 33L28 39" stroke="currentColor" stroke-width="2"/>
						<path d="M24 38V44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						
						<!-- Oil derrick - trapezoid structure (right) -->
						<path d="M36 44L38 16L44 16L46 44" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
						<path d="M38.5 24H43.5M37.5 32H44.5M36.5 40H45.5" stroke="currentColor" stroke-width="2"/>
						<path d="M41 16V12M41 12V44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						<path d="M38 12H44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</div>
				<SectionTitle level="h3" size="small" className="mb-2 text-xs sm:text-sm lg:text-base">Real Assets</SectionTitle>
				<p class="text-xs text-black opacity-70">Binding legal and contractual claims to real energy revenue</p>
			</div>
			
			<div class="flex flex-col items-center text-center">
				<div class="mb-4 lg:mb-6 text-black flex items-center justify-center w-16 h-16 lg:w-20 lg:h-20 relative">
					<!-- Tall buildings/skyline for institutional -->
					<svg width="48" height="48" class="lg:w-16 lg:h-16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M8 44H40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						<path d="M16 44V12H32V44" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
						<path d="M8 44V24H16" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
						<path d="M32 44V20H40V44" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
						<path d="M20 16H24M24 16H28M20 20H24M24 20H28M20 24H24M24 24H28M20 28H24M24 28H28M20 32H24M24 32H28M20 36H24M24 36H28M20 40H24M24 40H28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						<path d="M12 28V30M12 32V34M12 36V38M12 40V42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						<path d="M36 24V26M36 28V30M36 32V34M36 36V38M36 40V42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</div>
				<SectionTitle level="h3" size="small" className="mb-2 text-xs sm:text-sm lg:text-base">Institutional Grade</SectionTitle>
				<p class="text-xs text-black opacity-70">Revenue from established energy companies</p>
			</div>
			
			<div class="flex flex-col items-center text-center">
				<div class="mb-4 lg:mb-6 text-black flex items-center justify-center w-16 h-16 lg:w-20 lg:h-20 relative">
					<!-- Eye icon for transparency -->
					<svg width="48" height="48" class="lg:w-16 lg:h-16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M24 14C14 14 6 24 6 24C6 24 14 34 24 34C34 34 42 24 42 24C42 24 34 14 24 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						<circle cx="24" cy="24" r="6" stroke="currentColor" stroke-width="2"/>
						<circle cx="24" cy="24" r="2" fill="currentColor"/>
					</svg>
				</div>
				<SectionTitle level="h3" size="small" className="mb-2 text-xs sm:text-sm lg:text-base">Transparent</SectionTitle>
				<p class="text-xs text-black opacity-70">All revenue flows recorded on-chain with real-time payout tracking and public audit trails</p>
			</div>
		</div>
	</ContentSection>

	<!-- Market Insights - Hidden on mobile -->
	<ContentSection background="secondary" padding="standard" centered className="hidden lg:block">
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
			<div class="space-y-4 lg:space-y-6">
				<h3 class="text-2xl lg:text-3xl font-extrabold mb-4 lg:mb-6 text-white">Market Indicators</h3>
				{#if marketDataLoading}
					<div class="flex flex-col gap-3 lg:gap-4">
						<div class="flex justify-between items-center font-semibold text-sm lg:text-base">
							<span>WTI Crude Oil</span>
							<span class="text-primary font-extrabold">Loading...</span>
						</div>
						<div class="flex justify-between items-center font-semibold text-sm lg:text-base">
							<span>Brent Crude</span>
							<span class="text-primary font-extrabold">Loading...</span>
						</div>
						<div class="flex justify-between items-center font-semibold text-sm lg:text-base">
							<span>Henry Hub Natural Gas</span>
							<span class="text-primary font-extrabold">Loading...</span>
						</div>
					</div>
				{:else if marketData}
					<div class="flex flex-col gap-3 lg:gap-4">
						<div class="flex justify-between items-center font-semibold text-sm lg:text-base">
							<span>WTI Crude Oil</span>
							<span class="text-primary font-extrabold">
								{marketData.oilPrices.wti.price > 0 ? `US$${marketDataService.formatPrice(marketData.oilPrices.wti.price)}` : 'N/A'}
								{#if marketData.oilPrices.wti.price > 0}
									<span class="text-xs font-semibold ml-2 {marketData.oilPrices.wti.change >= 0 ? 'text-primary' : 'text-red-500'}">
										{marketDataService.formatChange(marketData.oilPrices.wti.change)}
									</span>
								{/if}
							</span>
						</div>
						<div class="flex justify-between items-center font-semibold text-sm lg:text-base">
							<span>Brent Crude</span>
							<span class="text-primary font-extrabold">
								{marketData.oilPrices.brent.price > 0 ? `US$${marketDataService.formatPrice(marketData.oilPrices.brent.price)}` : 'N/A'}
								{#if marketData.oilPrices.brent.price > 0}
									<span class="text-xs font-semibold ml-2 {marketData.oilPrices.brent.change >= 0 ? 'text-primary' : 'text-red-500'}">
										{marketDataService.formatChange(marketData.oilPrices.brent.change)}
									</span>
								{/if}
							</span>
						</div>
						<div class="flex justify-between items-center font-semibold text-sm lg:text-base">
							<span>Henry Hub Natural Gas</span>
							<span class="text-primary font-extrabold">
								{marketData.oilPrices.naturalGas.price > 0 ? `US$${marketDataService.formatPrice(marketData.oilPrices.naturalGas.price)}` : 'N/A'}
								{#if marketData.oilPrices.naturalGas.price > 0}
									<span class="text-xs font-semibold ml-2 {marketData.oilPrices.naturalGas.change >= 0 ? 'text-primary' : 'text-red-500'}">
										{marketDataService.formatChange(marketData.oilPrices.naturalGas.change)}
									</span>
								{/if}
							</span>
						</div>
					</div>
					<!-- Alpha Vantage Attribution -->
					<div class="text-xs text-white/60 mt-4">
						{marketData.attribution}
					</div>
				{:else}
					<div class="flex flex-col gap-3 lg:gap-4">
						<div class="flex justify-between items-center font-semibold text-sm lg:text-base">
							<span>WTI Crude Oil</span>
							<span class="text-primary font-extrabold">N/A</span>
						</div>
						<div class="flex justify-between items-center font-semibold text-sm lg:text-base">
							<span>Brent Crude</span>
							<span class="text-primary font-extrabold">N/A</span>
						</div>
						<div class="flex justify-between items-center font-semibold text-sm lg:text-base">
							<span>Henry Hub Natural Gas</span>
							<span class="text-primary font-extrabold">N/A</span>
						</div>
					</div>
				{/if}
			</div>
			
			<div class="text-center p-8 lg:p-12 bg-white/10 border border-white/20">
				<h4 class="text-xl lg:text-2xl font-extrabold mb-3 lg:mb-4 text-white">Start Investing Today</h4>
				<p class="mb-6 lg:mb-8 opacity-90 text-sm lg:text-base">Join {$sftsFormattedStats.activeInvestors} investors earning from real energy assets</p>
				<SecondaryButton href="/assets">Get Started Now</SecondaryButton>
			</div>
		</div>
	</ContentSection>
</PageLayout>

<!-- Token Purchase Widget -->
<TokenPurchaseWidget 
	bind:isOpen={showPurchaseWidget}
	tokenAddress={selectedTokenAddress}
	assetId={selectedAssetId}
	on:purchaseSuccess={handlePurchaseSuccess}
	on:close={handleWidgetClose}
/>
