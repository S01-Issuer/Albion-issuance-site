<script lang="ts">
	import { page } from '$app/stores';
	import { useTokenService } from '$lib/services';
	import { sftMetadata, sfts } from '$lib/stores';
	import type { Asset, Token } from '$lib/types/uiTypes';
	import { Card, CardContent, PrimaryButton, SecondaryButton, Chart, CollapsibleSection } from '$lib/components/components';
	import SectionTitle from '$lib/components/components/SectionTitle.svelte';

	import TabButton from '$lib/components/components/TabButton.svelte';
	import { PageLayout, ContentSection } from '$lib/components/layout';
	import { getImageUrl } from '$lib/utils/imagePath';
	import { formatCurrency, formatEndDate, formatSmartReturn } from '$lib/utils/formatters';
	import { hasIncompleteReleases } from '$lib/utils/futureReleases';
	import { 
		useAssetDetailData,
		useDataExport, 
		useTooltip, 
		useEmailNotification
	} from '$lib/composables';
	import { onMount } from 'svelte';
	import AssetDetailHeader from '$lib/components/patterns/assets/AssetDetailHeader.svelte';
	import AssetOverviewTab from '$lib/components/patterns/assets/AssetOverviewTab.svelte';
    import { calculateTokenReturns, getTokenPayoutHistory, getTokenSupply } from '$lib/utils/returnCalculations';
    import { formatEther } from 'viem';
    import { PINATA_GATEWAY } from '$lib/network';

	let activeTab = 'overview';
	let unclaimedPayout = 0; // Will be calculated from actual token holdings
	
	// Purchase widget state
	let showPurchaseWidget = false;
	let selectedTokenAddress: string | null = null;
	
	// Future releases state
	let hasFutureReleases = false;
	
	// Get asset ID from URL params
	$: assetId = $page.params.id;
	
	// Use composables - initialize immediately with current assetId
	const assetDetailComposable = useAssetDetailData(assetId);
	const assetDetailState = assetDetailComposable.state;
	const loadAssetData = assetDetailComposable.loadAssetData;
	
	// Load data when asset ID changes and SFT data is available
	$: if (assetId && $sftMetadata && $sfts) {
		loadAssetData(assetId);
	}
	const { exportProductionData: exportDataFunc, exportPaymentHistory } = useDataExport();
	const { state: emailState, setEmail, submitEmail } = useEmailNotification();
	
	// Reactive data from composable
	$: ({ asset: assetData, tokens: assetTokens, loading, error } = $assetDetailState);
	
	// Check for future releases when asset data is available
	$: if (assetId && assetData) {
		hasIncompleteReleases(assetId).then(hasIncomplete => {
			hasFutureReleases = hasIncomplete;
		});
	}
	
	async function downloadDocument(doc: any) {
		try {
			const response = await fetch(`${PINATA_GATEWAY}/${doc.ipfs}`);
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = doc.name || 'document';
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch (error) {
			console.error('Download failed:', error);
			alert('Download failed. Please try again.');
		}
	}
	
	
	function showTooltipWithDelay(tooltipId: string) {
		clearTimeout(tooltipTimer);
		tooltipTimer = setTimeout(() => {
			showTooltip = tooltipId;
		}, 500);
	}
	
	function hideTooltip() {
		clearTimeout(tooltipTimer);
		showTooltip = '';
	}
	
	// Email popup state
	let showEmailPopup = false;
	
	// Track flipped state for each token card
	let flippedCards = new Set();
	
	// Tooltip state
	let showTooltip = '';
	let tooltipTimer: any = null;
	
	let failedImages = new Set<string>();
	
	function handleImageError(imageUrl: string) {
		failedImages.add(imageUrl);
		failedImages = new Set(failedImages); // Trigger reactivity
	}

	
	function toggleCardFlip(tokenAddress: string) {
		if (flippedCards.has(tokenAddress)) {
			flippedCards.delete(tokenAddress);
		} else {
			flippedCards.add(tokenAddress);
		}
		flippedCards = new Set(flippedCards); // Trigger reactivity
	}

	// Decide what to do when the card itself is clicked
	function handleCardClick(tokenAddress: string) {
		if (flippedCards.has(tokenAddress)) {
			// If the card is showing the back, flip it back to the front
			toggleCardFlip(tokenAddress);
		} else {
			// Otherwise open the purchase panel
			handleBuyTokens(tokenAddress);
		}
	}



	function exportProductionData() {
		if (assetData) {
			exportDataFunc(assetData);
		}
	}

	function exportPaymentsData() {
		if (assetTokens.length > 0) {
			exportPaymentHistory(assetTokens);
		}
	}


	function handleBuyTokens(tokenAddress: string) {
		selectedTokenAddress = tokenAddress;
		showPurchaseWidget = true;
	}
	
	function handlePurchaseSuccess() {
		showPurchaseWidget = false;
		selectedTokenAddress = null;
		// Could refresh token data here
	}
	
	function handleWidgetClose() {
		showPurchaseWidget = false;
		selectedTokenAddress = null;
	}
	
	function handleGetNotified() {
		showEmailPopup = true;
	}
	
	function handleCloseEmailPopup() {
		showEmailPopup = false;
	}
	
	function handleSubscribeFormSubmit() {
		// Store the current page path before form submission
		sessionStorage.setItem('lastPageBeforeSubscribe', $page.url.pathname + $page.url.search);
		// The form will handle the actual submission
	}
	
	onMount(() => {
		// Add event listener to the form
		const form = document.getElementById('mc-embedded-subscribe-form');
		if (form) {
			// Use capture phase to ensure our handler runs first
			form.addEventListener('submit', handleSubscribeFormSubmit, true);
		}
		
		// Cleanup
		return () => {
			if (form) {
				form.removeEventListener('submit', handleSubscribeFormSubmit, true);
			}
		};
	});

</script>

<svelte:head>
	<title>{assetData?.name || 'Asset Details'} - Albion</title>
	<meta name="description" content="Detailed information about {assetData?.name || 'asset'}" />
</svelte:head>

<PageLayout variant="constrained">
	{#if loading}
		<div class="text-center py-16 px-8 text-black">
			<p>Loading asset details...</p>
		</div>
	{:else if error}
		<div class="text-center py-16 px-8 text-black">
			<h1>Error</h1>
			<p>{error}</p>
			<a href="/assets" class="px-8 py-4 no-underline font-semibold text-sm uppercase tracking-wider transition-colors duration-200 inline-block bg-black text-white hover:bg-secondary inline-block">Back to Assets</a>
		</div>
	{:else}
		{#if assetData}
			<AssetDetailHeader 
				asset={assetData} 
				tokenCount={assetTokens.length} 
				onTokenSectionClick={() => document.getElementById('token-section')?.scrollIntoView({ behavior: 'smooth' })}
			/>
		{/if}

		<!-- Asset Details Content -->
        <ContentSection background="white" padding="standard">
        	<!-- Mobile: Collapsible sections -->
        	<div class="lg:hidden space-y-4">
        		<!-- Overview in collapsible section -->
        		<CollapsibleSection title="Overview" isOpenByDefault={false} alwaysOpenOnDesktop={false}>
        			{#if assetData}
        				<AssetOverviewTab asset={assetData} />
        			{/if}
        		</CollapsibleSection>
        		
        		<!-- Other sections in collapsible format -->
        		<CollapsibleSection title="Production Data" isOpenByDefault={false} alwaysOpenOnDesktop={false}>
        			{@const productionReports = assetData?.productionHistory || assetData?.monthlyReports || []}
					{@const maxProduction = productionReports.length > 0 ? Math.max(...productionReports.map((r: any) => r.production)) : 100}
					<div class="flex-1 flex flex-col">
						<div class="grid md:grid-cols-4 grid-cols-1 gap-6">
							<div class="bg-white border border-light-gray p-6 md:col-span-3">
								<div class="flex justify-between items-center mb-6">
									<h4 class="text-lg font-extrabold text-black mb-0">Production History</h4>
									<SecondaryButton on:click={exportProductionData}>
										📊 Export Data
									</SecondaryButton>
								</div>
								{#if productionReports.length > 0}
									<Chart
										data={productionReports.map((report: any) => ({
											label: report.month,
											value: report.production
										}))}
										width={800}
										height={300}
										barColor="#08bccc"
										valuePrefix=""
										valueSuffix=" BOE"
										animate={true}
										showGrid={true}
									/>
								{:else}
									<div class="flex flex-col items-center justify-center h-32 text-black opacity-70">
										<div class="text-4xl mb-2">📊</div>
										<p>No production data available</p>
									</div>
								{/if}
							</div>
							<div class="bg-white border border-light-gray p-6">
								<h4 class="text-lg font-extrabold text-black mb-6">Key Metrics</h4>
								<div class="grid grid-cols-1 gap-4">
									<!-- Uptime -->
									<div class="text-center p-3 bg-light-gray">
										<div class="text-2xl font-extrabold text-black mb-1">
											{#if assetData?.operationalMetrics?.uptime?.percentage !== undefined}
												{assetData.operationalMetrics.uptime.percentage.toFixed(1)}%
											{:else}
												<span class="text-gray-400">N/A</span>
											{/if}
										</div>
										<div class="text-sm font-medium text-black opacity-70">
											Uptime {assetData?.operationalMetrics?.uptime?.period?.replace('_', ' ') || 'N/A'}
										</div>
									</div>
									
									<!-- Current Daily Production -->
									<div class="text-center p-3 bg-light-gray">
										<div class="text-2xl font-extrabold text-black mb-1">
											{#if assetData?.operationalMetrics?.dailyProduction?.current !== undefined}
												{assetData.operationalMetrics.dailyProduction.current.toFixed(1)}
											{:else}
												<span class="text-gray-400">N/A</span>
											{/if}
										</div>
										<div class="text-sm font-medium text-black opacity-70">
											Current Daily Production ({assetData?.operationalMetrics?.dailyProduction?.unit || 'units'})
										</div>
									</div>
									
									<!-- HSE Incident Free Days -->
									<div class="text-center p-3 bg-light-gray">
										<div class="text-2xl font-extrabold text-black mb-1">
											{#if assetData?.operationalMetrics?.hseMetrics?.incidentFreeDays !== undefined}
												{assetData.operationalMetrics.hseMetrics.incidentFreeDays}
											{:else}
												<span class="text-gray-400">N/A</span>
											{/if}
										</div>
										<div class="text-sm font-medium text-black opacity-70">Days Since Last HSE Incident</div>
									</div>
								</div>
							</div>
						</div>
					</div>
        		</CollapsibleSection>
        		
        		<CollapsibleSection title="Revenue History" isOpenByDefault={false} alwaysOpenOnDesktop={false}>
        			{@const monthlyReports = assetData?.monthlyReports || []}
					{@const reportsWithRevenue = monthlyReports.filter(r => r.netIncome && r.netIncome > 0)}
					{@const maxRevenue = reportsWithRevenue.length > 0 ? Math.max(...reportsWithRevenue.map(r => r.netIncome || 0)) : 1500}
					<div class="space-y-4">
						{#if reportsWithRevenue.length > 0}
							<div class="bg-white border border-light-gray p-4">
								<h4 class="text-base font-bold text-black mb-4">Received Revenue</h4>
								<div class="space-y-2">
									{#each reportsWithRevenue.slice(-6) as report}
										<div class="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0">
											<div class="text-sm text-black">{report.month}</div>
											<div class="text-sm font-semibold text-primary">{formatCurrency(report.netIncome || 0)}</div>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<div class="bg-white border border-light-gray p-4 opacity-50">
								<h4 class="text-base font-bold text-gray-400 mb-4">Received Revenue</h4>
								<div class="text-center py-8 text-gray-400">
									<div class="text-4xl mb-2">N/A</div>
									<p>No revenue received yet</p>
								</div>
							</div>
						{/if}
					</div>
        		</CollapsibleSection>
        		
        		<CollapsibleSection title="Gallery" isOpenByDefault={false} alwaysOpenOnDesktop={false}>
        			<div class="grid grid-cols-2 gap-4">
						{#if assetData?.galleryImages && assetData.galleryImages.length > 0}
							{#each assetData.galleryImages.slice(0, 4) as image}
								<div
								   class="bg-white border border-light-gray overflow-hidden group cursor-pointer"
								   on:click={() => window.open(getImageUrl(image.url), '_blank')}
								   on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.open(getImageUrl(image.url), '_blank'); } }}
								   role="button"
								   tabindex="0"
								>
									{#if !failedImages.has(image.url)}
										<img 
											src={getImageUrl(image.url)} 
											alt={image.caption || 'Asset gallery image'} 
											class="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300"
											on:error={() => handleImageError(image.url)}
										/>
									{:else}
										<div class="w-full h-32 bg-light-gray flex items-center justify-center">
											<div class="text-center">
												<div class="text-2xl mb-1">🖼️</div>
												<p class="text-xs text-black opacity-50">Failed to load</p>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						{:else}
							<div class="col-span-2 text-center py-8 text-black opacity-70">
								<div class="text-4xl mb-2">🖼️</div>
								<p>No gallery images available</p>
							</div>
						{/if}
					</div>
        		</CollapsibleSection>
        		
        		<CollapsibleSection title="Documents" isOpenByDefault={false} alwaysOpenOnDesktop={false}>
        			<div class="space-y-3">
						{#if assetTokens[0]?.asset?.documents && assetTokens[0].asset.documents.length > 0}
							<!-- Legal Documents -->
							{#each assetTokens[0].asset.documents as document}
								<div class="flex items-center justify-between p-4 border-b border-light-gray last:border-b-0">
									<div class="flex items-center space-x-3">
										<div class="w-8 h-8 bg-secondary rounded flex items-center justify-center">
												📄
										</div>
										<div>
											<h4 class="font-semibold text-black">{document.name || 'Document'}</h4>
											<p class="text-sm text-gray-600">{document.type.toUpperCase() || 'No description available'}</p>
										</div>
									</div>
									<SecondaryButton
									on:click={() => downloadDocument(document)}
									>Download</SecondaryButton>
								</div>
							{/each}
						{:else}
							<div class="text-center py-8 text-gray-500">
								<p>No documents available for this asset</p>
							</div>
						{/if}
					</div>
        		</CollapsibleSection>
        	</div>
        	
        	<!-- Desktop: Traditional tabs -->
        	<div class="hidden lg:block">
                <div class="bg-white border border-light-gray mb-8" id="asset-details-tabs">
                <div class="flex flex-wrap border-b border-light-gray">
                        <TabButton
                                active={activeTab === 'overview'}
                                on:click={() => activeTab = 'overview'}
                        >
                                Overview
                        </TabButton>
                        <TabButton
                                active={activeTab === 'production'}
                                on:click={() => activeTab = 'production'}
                        >
                                Production Data
                        </TabButton>
                        <TabButton
                                active={activeTab === 'payments'}
                                on:click={() => activeTab = 'payments'}
                        >
                                Received Revenue
                        </TabButton>
                        <TabButton
                                active={activeTab === 'gallery'}
                                on:click={() => activeTab = 'gallery'}
                        >
                                Gallery
                        </TabButton>
                        <TabButton
                                active={activeTab === 'documents'}
                                on:click={() => activeTab = 'documents'}
                        >
                                Documents
                        </TabButton>
                </div>

			<!-- Tab Content -->
			<div class="p-8 min-h-[500px] flex flex-col">
				{#if activeTab === 'overview'}
					{#if assetData}
						<AssetOverviewTab asset={assetData} />
					{/if}
				{:else if activeTab === 'production'}
					{@const productionReports = assetData?.productionHistory || assetData?.monthlyReports || []}
					{@const maxProduction = productionReports.length > 0 ? Math.max(...productionReports.map((r: any) => r.production)) : 100}
					<div class="flex-1 flex flex-col">
						<div class="grid md:grid-cols-4 grid-cols-1 gap-6">
							<div class="bg-white border border-light-gray p-6 md:col-span-3">
								<div class="flex justify-between items-center mb-6">
									<h4 class="text-lg font-extrabold text-black mb-0">Production History</h4>
									<SecondaryButton on:click={exportProductionData}>
										📊 Export Data
									</SecondaryButton>
								</div>
								<div class="w-full">
									<Chart
										data={productionReports.map((report: any) => {
											// Handle different date formats
											let dateStr = report.month || '';
											if (dateStr && !dateStr.includes('-01')) {
												dateStr = dateStr + '-01';
											}
											return {
												label: dateStr,
												value: report.production
											};
										})}
										width={700}
										height={350}
										valueSuffix=" BOE"
										barColor="#08bccc"
										animate={true}
										showGrid={true}
									/>
								</div>
							</div>

							<div class="bg-white border border-light-gray p-6">
								<h4 class="text-lg font-extrabold text-black mb-6">Production Metrics</h4>
								<div class="text-center mb-6 p-4 bg-white">
									<div class="text-4xl font-extrabold text-black mb-2">
										{#if assetData?.operationalMetrics?.uptime?.percentage !== undefined}
											{assetData.operationalMetrics.uptime.percentage.toFixed(1)}%
										{:else}
											<span class="text-gray-400">N/A</span>
										{/if}
									</div>
									<div class="text-base font-medium text-black opacity-70">
										Uptime {assetData?.operationalMetrics?.uptime?.period?.replace('_', ' ') || 'N/A'}
									</div>
								</div>
								<div class="grid grid-cols-1 gap-4 mb-6">
									<div class="text-center p-3 bg-white">
										<div class="text-3xl font-extrabold text-black mb-1">
											{#if assetData?.operationalMetrics?.dailyProduction?.current !== undefined}
												{assetData.operationalMetrics.dailyProduction.current.toFixed(1)}
											{:else}
												<span class="text-gray-400">N/A</span>
											{/if}
										</div>
										<div class="text-sm font-medium text-black opacity-70">
											Current Daily Production ({assetData?.operationalMetrics?.dailyProduction?.unit || 'units'})
										</div>
									</div>
								</div>
								<div class="text-center p-4 bg-white">
									<div class="text-4xl font-extrabold text-black mb-2">
										{#if assetData?.operationalMetrics?.hseMetrics?.incidentFreeDays !== undefined}
											{assetData.operationalMetrics.hseMetrics.incidentFreeDays}
										{:else}
											<span class="text-gray-400">N/A</span>
										{/if}
									</div>
									<div class="text-base font-medium text-black opacity-70">Days Since Last HSE Incident</div>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'payments'}
					{@const monthlyReports = assetData?.monthlyReports || []}
					{@const maxRevenue = monthlyReports.length > 0 ? Math.max(...monthlyReports.map(r => r.netIncome ?? 0)) : 1500}
					{@const latestReport = monthlyReports[monthlyReports.length - 1]}
					{@const nextMonth = (() => {
						// Use first payment date from primary token if no revenue yet
						if (!latestReport || !latestReport.netIncome || latestReport.netIncome === 0) {
							const primaryToken = assetTokens && assetTokens.length > 0 ? assetTokens[0] : null;
							if (primaryToken?.firstPaymentDate) {
								// Parse YYYY-MM format and set to end of month
								const [year, month] = primaryToken.firstPaymentDate.split('-').map(Number);
								const date = new Date(year, month - 1, 1);
								// Get last day of the month
								return new Date(date.getFullYear(), date.getMonth() + 1, 0);
							}
						}
						// If we have revenue, use month after last report
						if (latestReport) {
							const lastDate = new Date(latestReport.month + '-01');
							return new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 1);
						}
						// Fallback to current date
						return new Date();
					})()}
					{@const avgRevenue = monthlyReports.length > 0 ? monthlyReports.reduce((sum, r) => sum + (r.netIncome ?? 0), 0) / monthlyReports.length : 0}
					{@const hasRevenue = monthlyReports.some(r => r.netIncome && r.netIncome > 0)}
					<div class="flex-1 flex flex-col">
						<div class="grid md:grid-cols-4 grid-cols-1 gap-6">
							<div class="bg-white border border-light-gray p-6 md:col-span-3">
								<div class="flex justify-between items-center mb-6">
									<h4 class="text-lg font-extrabold text-black mb-0">Received Revenue</h4>
									<SecondaryButton on:click={exportPaymentsData}>
										📊 Export Data
									</SecondaryButton>
								</div>
								<div class="w-full relative">
									<Chart
										data={monthlyReports.map(report => {
											// Handle different date formats
											let dateStr = report.month || '';
											if (dateStr && !dateStr.includes('-01')) {
												dateStr = dateStr + '-01';
											}
											return {
												label: dateStr,
												value: report.netIncome ?? 0
											};
										})}
										width={700}
										height={350}
										valuePrefix="$"
										barColor="#08bccc"
										animate={true}
										showGrid={true}
									/>
									{#if !hasRevenue}
										<div class="absolute inset-0 bg-gray-100 bg-opacity-90 flex items-center justify-center rounded">
											<div class="text-center">
												<div class="text-6xl font-bold text-gray-400 mb-2">N/A</div>
												<p class="text-gray-500">No revenue data available yet</p>
											</div>
										</div>
									{/if}
								</div>
							</div>

							<div class="bg-white border border-light-gray p-6">
								<h4 class="text-lg font-extrabold text-black mb-6">Revenue Metrics</h4>
								<div class="text-center mb-6 p-4 bg-white">
									<div class="text-4xl font-extrabold text-black mb-2">{nextMonth.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</div>
									<div class="text-base font-medium text-black opacity-70">Next Report Due</div>
								</div>
								<div class="grid grid-cols-1 gap-4 mb-6">
									<div class="text-center p-3 bg-white">
										<div class="text-3xl font-extrabold text-black mb-1">
											{#if latestReport?.netIncome !== undefined}
												US${latestReport.netIncome.toFixed(0)}
											{:else}
												<span class="text-gray-400">N/A</span>
											{/if}
										</div>
										<div class="text-sm font-medium text-black opacity-70">Latest Monthly Revenue</div>
									</div>
								</div>
								<div class="text-center p-4 bg-white">
									<div class="text-4xl font-extrabold text-black mb-2">
										{#if avgRevenue > 0}
											US${avgRevenue.toFixed(0)}
										{:else}
											<span class="text-gray-400">N/A</span>
										{/if}
									</div>
									<div class="text-base font-medium text-black opacity-70">Avg Monthly Revenue</div>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'gallery'}
					<div class="flex-1 flex flex-col">
						<div class="grid md:grid-cols-3 grid-cols-1 gap-6">
							{#if assetData?.galleryImages && assetData.galleryImages.length > 0}
								{#each assetData.galleryImages as image}
									<div 
										class="bg-white border border-light-gray overflow-hidden group cursor-pointer" 
										on:click={() => window.open(getImageUrl(image.url), '_blank')}
										on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.open(getImageUrl(image.url), '_blank'); } }}
										role="button"
										tabindex="0"
										aria-label={`View ${image.caption || image.title || 'Asset image'} in new tab`}
									>
										{#if !failedImages.has(image.url)}
											<img 
												src={getImageUrl(image.url)} 
												alt={image.caption || image.title || 'Asset image'}
												loading="lazy"
												class="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-105"
												on:error={() => handleImageError(image.url)}
											/>
										{:else}
											<div class="w-full h-64 bg-light-gray flex items-center justify-center">
												<div class="text-center">
													<div class="text-4xl mb-2">🖼️</div>
													<p class="text-sm text-black opacity-50">Failed to load image</p>
												</div>
											</div>
										{/if}
										{#if image.caption || image.title}
											<div class="p-4">
												<p class="text-sm text-black">{image.caption || image.title}</p>
											</div>
										{/if}
									</div>
								{/each}
							{:else}
								<!-- No gallery images available -->
								<div class="col-span-full text-center py-16">
									<p class="text-lg text-black opacity-70">No gallery images available for this asset.</p>
								</div>
							{/if}
						</div>
					</div>
				{:else if activeTab === 'documents'}
					{#if assetTokens[0]?.asset?.documents && assetTokens[0].asset.documents.length > 0}
						{#each assetTokens[0].asset.documents as document}
							<div class="grid md:grid-cols-2 grid-cols-1 gap-8">
								<div class="space-y-4">
									<div class="flex items-center justify-between p-4 bg-white border border-light-gray hover:bg-white transition-colors duration-200">
										<div class="flex items-center gap-3">
												<div class="text-2xl">📄</div>
											<div>
												<div class="font-semibold text-black">{document.name}</div>
												<div class="text-sm text-black opacity-70">{document.type.toUpperCase()}</div>
											</div>
										</div>
										<SecondaryButton
										on:click={() => downloadDocument(document)}
										>Download</SecondaryButton>
									</div>

								</div>
							</div>
						{/each}
					{:else}
						<div class="col-span-full text-center py-16">
							<p class="text-lg text-black opacity-70">No documents available for this asset.</p>
						</div>
					{/if}
				{/if}
			</div>
			</div>
		</div>
	</ContentSection>

		<!-- Available Tokens Section -->
		<ContentSection background="white" padding="compact">
			<div class="bg-white border border-light-gray section-no-border" id="token-section">
				<div class="py-6">
					<h3 class="text-3xl md:text-2xl font-extrabold text-black uppercase tracking-wider mb-8">Token Information</h3>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
					{#each assetTokens as token}
						{@const supply = getTokenSupply(token)}
						{@const hasAvailableSupply = supply && supply.availableSupply > 0}
						{@const tokenPayoutData = getTokenPayoutHistory(token)}
						{@const latestPayout = tokenPayoutData?.recentPayouts?.[0]}
						{@const sft = $sfts?.find(s => s.id.toLowerCase() === token.contractAddress.toLowerCase())}
						{@const calculatedReturns = calculateTokenReturns(assetData!, token, sft?.totalShares)}
						{@const isFlipped = flippedCards.has(token.contractAddress)}
						<div id="token-{token.contractAddress}">
							<Card hoverable clickable paddingClass="p-0" on:click={() => handleCardClick(token.contractAddress)}>
								<CardContent paddingClass="p-0">
									<div class="relative preserve-3d transform-gpu transition-transform duration-500 {isFlipped ? 'rotate-y-180' : ''} min-h-[700px] sm:min-h-[600px]">
										<!-- Front of card -->
										<div class="absolute inset-0 backface-hidden">
											<!-- Full width availability banner -->
											<div class="{!hasAvailableSupply ? 'text-base font-extrabold text-white bg-black text-center py-3 uppercase tracking-wider' : 'text-base font-extrabold text-black bg-primary text-center py-3 uppercase tracking-wider'} w-full">
												{hasAvailableSupply ? 'Available for Purchase' : 'Currently Sold Out'}
											</div>
											
											<div class="p-8 pb-0 relative">
												<div class="flex-1 mt-6">
													<div class="flex justify-between items-start mb-3 gap-4">
														<h4 class="text-2xl font-extrabold text-black font-figtree flex-1">{token.releaseName}</h4>
														<div class="text-sm font-extrabold text-white bg-secondary px-3 py-1 tracking-wider rounded whitespace-nowrap">
															{token.sharePercentage || 25}% of Asset
														</div>
													</div>
													<p class="text-sm text-secondary font-medium break-all tracking-tight opacity-80 font-figtree">{token.contractAddress}</p>
												</div>
											</div>
								
											<div class="p-8 pt-6 space-y-4">
												<div class="flex justify-between items-start">
													<span class="text-base font-medium text-black opacity-70 relative font-figtree">Minted Supply </span>
													<span class="text-base font-extrabold text-black text-right font-figtree">{Math.floor(Number(formatEther(BigInt(token.supply?.mintedSupply || 0))))}</span>
												</div>
												<div class="flex justify-between items-start">
													<span class="text-base font-medium text-black opacity-70 relative font-figtree">Max Supply</span>
													<span class="text-base font-extrabold text-black text-right font-figtree">{Math.floor(Number(formatEther(BigInt(token.supply?.maxSupply || 0))))}</span>
												</div>
												<div class="flex justify-between items-start relative">
													<span class="text-base font-medium text-black opacity-70 relative font-figtree">
														Implied Barrels/Token
														<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold ml-1 cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100"
															on:mouseenter={() => showTooltipWithDelay('barrels')}
															on:mouseleave={hideTooltip}
															role="button"
															tabindex="0">ⓘ</span>
													</span>
													<span class="text-base font-extrabold text-black text-right">{calculatedReturns?.impliedBarrelsPerToken === Infinity ? '∞' : calculatedReturns?.impliedBarrelsPerToken?.toFixed(6) || '0.000000'}</span>
													{#if showTooltip === 'barrels'}
														<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded text-xs whitespace-nowrap z-[1000] mb-[5px] max-w-[200px] whitespace-normal text-left">
															Estimated barrels of oil equivalent per token based on reserves and token supply
														</div>
													{/if}
												</div>
												<div class="flex justify-between items-start relative">
													<span class="text-base font-medium text-black opacity-70 relative font-figtree">
														Breakeven Oil Price
														<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold ml-1 cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100"
															on:mouseenter={() => showTooltipWithDelay('breakeven')}
															on:mouseleave={hideTooltip}
															role="button"
															tabindex="0">ⓘ</span>
													</span>
													<span class="text-base font-extrabold text-black text-right">US${calculatedReturns?.breakEvenOilPrice?.toFixed(2) || '0.00'}</span>
													{#if showTooltip === 'breakeven'}
														<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded text-xs whitespace-nowrap z-[1000] mb-[5px] max-w-[200px] whitespace-normal text-left">
															Oil price required to cover operational costs and maintain profitability
														</div>
													{/if}
												</div>
											</div>

											<div class="p-8 pt-0 border-t border-light-gray">
												<h5 class="text-sm font-extrabold text-black uppercase tracking-wider mb-4 pt-6">Estimated Returns</h5>
												<div class="grid grid-cols-3 gap-3">
													<div class="text-center p-3 bg-white">
														<span class="text-xs font-medium text-black opacity-70 block mb-1 relative">
															Base
															<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold ml-1 cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100"
																on:mouseenter={() => showTooltipWithDelay('base')}
																on:mouseleave={hideTooltip}
																role="button"
																tabindex="0">ⓘ</span>
														</span>
														<span class="text-xl font-extrabold text-primary">{formatSmartReturn(calculatedReturns?.baseReturn)}</span>
														{#if showTooltip === 'base'}
															<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded text-xs whitespace-nowrap z-[1000] mb-[5px] max-w-[200px] whitespace-normal text-left">
																Conservative return estimate based on current production and oil prices
															</div>
														{/if}
													</div>
													<div class="text-center p-3 bg-white">
														<span class="text-xs font-medium text-black opacity-70 block mb-1 relative">
															Bonus
															<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold ml-1 cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100"
																on:mouseenter={() => showTooltipWithDelay('bonus')}
																on:mouseleave={hideTooltip}
																role="button"
																tabindex="0">ⓘ</span>
														</span>
														<span class="text-xl font-extrabold text-primary">{calculatedReturns?.bonusReturn !== undefined ? (formatSmartReturn(calculatedReturns.bonusReturn).startsWith('>') ? formatSmartReturn(calculatedReturns.bonusReturn) : '+' + formatSmartReturn(calculatedReturns.bonusReturn)) : 'TBD'}</span>
														{#if showTooltip === 'bonus'}
															<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded text-xs whitespace-nowrap z-[1000] mb-[5px] max-w-[200px] whitespace-normal text-left">
																Additional potential return from improved oil prices or production efficiency
															</div>
														{/if}
													</div>
													<div class="text-center p-3 bg-white hidden sm:block">
														<span class="text-xs font-medium text-black opacity-70 block mb-1 relative">Total Expected</span>
														<span class="text-xl font-extrabold text-primary">{calculatedReturns ? formatSmartReturn(calculatedReturns.baseReturn + calculatedReturns.bonusReturn) : 'TBD'}</span>
													</div>
												</div>
											</div>

											<div class="px-4 sm:px-8 pb-6 sm:pb-8">
												<div class="grid grid-cols-2 gap-2 sm:gap-3">
													{#if hasAvailableSupply}
														<PrimaryButton fullWidth size="small" on:click={(e) => { e.stopPropagation(); handleBuyTokens(token.contractAddress); }}>
															<span class="hidden sm:inline">Buy Tokens</span>
															<span class="sm:hidden">Buy</span>
														</PrimaryButton>
													{:else}
														<PrimaryButton fullWidth size="small" disabled>
															<span class="hidden sm:inline">Sold Out</span>
															<span class="sm:hidden">Sold Out</span>
														</PrimaryButton>
													{/if}
													<div on:click|stopPropagation={() => toggleCardFlip(token.contractAddress)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCardFlip(token.contractAddress); }} role="button" tabindex="0" class="cursor-pointer">
														<SecondaryButton fullWidth size="small">
															<span class="hidden sm:inline">Distributions History</span>
															<span class="sm:hidden">History</span>
														</SecondaryButton>
													</div>
												</div>
											</div>
										</div>
									</div>
									
									<!-- Back of card -->
									<div class="absolute inset-0 backface-hidden rotate-y-180 bg-white">
										<div class="p-8 flex flex-col h-full">
											<div class="flex justify-between items-center mb-6">
												<h4 class="text-xl font-extrabold text-black uppercase tracking-wider">Distributions History</h4>
												<div on:click|stopPropagation={() => toggleCardFlip(token.contractAddress)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCardFlip(token.contractAddress); }} role="button" tabindex="0">
													<SecondaryButton>
														← Back
													</SecondaryButton>
												</div>
											</div>
											
											{#if tokenPayoutData?.recentPayouts && tokenPayoutData.recentPayouts.length > 0}
												<div class="flex-1 flex flex-col">
													<div class="grid grid-cols-3 gap-2 text-xs font-bold text-black uppercase tracking-wider border-b border-light-gray pb-2 mb-4">
														<div class="text-left">Month</div>
														<div class="text-center">Total Payments</div>
														<div class="text-right">Per Token</div>
													</div>
													<div class="space-y-2 flex-1">
														{#each tokenPayoutData.recentPayouts.slice(-6) as payout}
															<div class="grid grid-cols-3 gap-2 text-sm">
																<div class="text-left font-medium text-black">{payout.month}</div>
																<div class="text-center font-semibold text-black">US${payout.totalPayout.toLocaleString()}</div>
																<div class="text-right font-semibold text-black">US${payout.payoutPerToken.toFixed(5)}</div>
															</div>
														{/each}
													</div>
													<div class="border-t border-light-gray my-4"></div>
													<div class="mt-auto">
														<div class="grid grid-cols-3 gap-2 text-sm font-extrabold">
															<div class="text-left text-black">Total</div>
															<div class="text-center text-black">US${tokenPayoutData.recentPayouts.reduce((sum, p) => sum + p.totalPayout, 0).toLocaleString()}</div>
															<div class="text-right text-black">US${(tokenPayoutData.recentPayouts.reduce((sum, p) => sum + p.payoutPerToken, 0)).toFixed(5)}</div>
														</div>
													</div>
												</div>
											{:else}
												<div class="text-center py-8 text-black opacity-70 flex-1 flex flex-col justify-center">
													<p class="text-sm font-semibold mb-2">No distributions yet</p>
													<p class="text-xs">No distributions have been made yet.</p>
													<p class="text-xs">Distributions will appear here once payouts begin.</p>
												</div>
											{/if}
										</div>
									</div>
						</CardContent>
					</Card>
				</div>
					{/each}
					<!-- Future Releases Card -->
					{#if hasFutureReleases}
					<Card hoverable>
						<CardContent paddingClass="p-0">
							<div class="flex flex-col justify-center text-center p-12" style="min-height: 650px;">
								<div class="text-5xl mb-6">🚀</div>
								<h4 class="text-xl font-extrabold mb-4 text-black uppercase tracking-wider">Future Releases</h4>
								<p class="text-base mb-8 text-black opacity-70">Additional token releases planned</p>
								<SecondaryButton on:click={handleGetNotified}>
									Get Notified
								</SecondaryButton>
							</div>
						</CardContent>
					</Card>
					{/if}
				</div>
				</div>
			</div>
		</ContentSection>

		<!-- Token Purchase Widget -->
		{#if showPurchaseWidget}
			{#await import('$lib/components/patterns/TokenPurchaseWidget.svelte') then { default: TokenPurchaseWidget }}
				<TokenPurchaseWidget 
					bind:isOpen={showPurchaseWidget}
					tokenAddress={selectedTokenAddress}
					on:purchaseSuccess={handlePurchaseSuccess}
					on:close={handleWidgetClose}
				/>
			{/await}
		{/if}

		<!-- Email Notification Popup -->
		{#if showEmailPopup}
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4" on:click={handleCloseEmailPopup}>
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<!-- svelte-ignore a11y-no-static-element-interactions -->
				<div class="bg-white border border-light-gray max-w-md w-full flex flex-col" style="max-height: 95vh; min-height: 500px;" on:click|stopPropagation role="dialog" aria-modal="true" tabindex="0">
					<div class="flex justify-between items-center p-6 border-b border-light-gray flex-shrink-0">
						<h3 class="text-xl font-extrabold text-black">Get Notified</h3>
						<button class="text-2xl font-bold text-black bg-transparent border-none cursor-pointer p-0 leading-none hover:opacity-70" on:click={handleCloseEmailPopup}>×</button>
					</div>
					<div class="p-6 overflow-y-auto">
						<p class="mb-4">Enter your email address to be notified when the next token release becomes available.</p>
						
						<!-- MailChimp Token Notification Form -->
						<div id="mc_embed_shell">
							<div id="mc_embed_signup">
								<form action="https://exchange.us7.list-manage.com/subscribe/post?u=f3b19322aa5fe51455b292838&amp;id=6eaaa49162&amp;f_id=00fc53e0f0" 
									  method="post" id="mc-embedded-subscribe-form" name="mc-embedded-subscribe-form" class="validate" target="_self" novalidate>
									<div id="mc_embed_signup_scroll">
										<h2 class="text-lg font-extrabold text-black mb-4">Subscribe for Token Updates</h2>
										<div class="text-sm text-black opacity-70 mb-4">Get notified when this token becomes available</div>
										
										<div class="mc-field-group mb-6">
											<label for="mce-EMAIL" class="block text-sm font-medium text-black mb-2">
												Email Address <span class="asterisk text-red-500">*</span>
											</label>
											<input type="email" name="EMAIL" 
												   class="required email w-full px-4 py-3 border border-light-gray bg-white text-black placeholder-black placeholder-opacity-50 focus:outline-none focus:border-primary" 
												   id="mce-EMAIL" required value=""
												   placeholder="Enter your email address"
											/>
										</div>
										
										<div hidden><input type="hidden" name="tags" value="3587473"></div>
										
										<div id="mce-responses" class="clear mt-4">
											<div class="response" id="mce-error-response" style="display: none;"></div>
											<div class="response" id="mce-success-response" style="display: none;"></div>
										</div>
										
										<div aria-hidden="true" style="position: absolute; left: -5000px;">
											<input type="text" name="b_f3b19322aa5fe51455b292838_6eaaa49162" tabindex="-1" value="">
										</div>
										
										<!-- Spacer -->
										<div style="height: 2rem;"></div>
										
										<div class="mt-8 mb-4">
											<button 
												type="submit" 
												class="w-full px-8 py-4 bg-black text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer transition-colors duration-200 hover:bg-secondary border-0"
												style="display: block; visibility: visible;"
												on:click={() => sessionStorage.setItem('lastPageBeforeSubscribe', $page.url.pathname + $page.url.search)}
											>
												Subscribe
											</button>
										</div>
									</div>
								</form>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</PageLayout>

<style>
	.preserve-3d {
		transform-style: preserve-3d;
	}
	
	.backface-hidden {
		backface-visibility: hidden;
	}
	
	.rotate-y-180 {
		transform: rotateY(180deg);
	}
</style>