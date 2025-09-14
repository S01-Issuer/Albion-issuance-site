<script lang="ts">
	import { page } from '$app/stores';
	import { sftMetadata, sfts, dataLoaded } from '$lib/stores';
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
	import AssetDetailHeader from '$lib/components/patterns/assets/AssetDetailHeader.svelte';
	import AssetOverviewTab from '$lib/components/patterns/assets/AssetOverviewTab.svelte';
    import { calculateTokenReturns, getTokenPayoutHistory, getTokenSupply } from '$lib/utils/returnCalculations';
    import { formatEther } from 'viem';
import { PINATA_GATEWAY } from '$lib/network';
import { onMount } from 'svelte';
//

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
	
	// Track if we've initiated loading for the current asset
	let hasInitiatedLoad = false;
	
	// Load data when asset ID changes and SFT data is available
	// The composable now handles duplicate load prevention internally
	// IMPORTANT: Wait for dataLoaded to ensure both stores have actual data
	$: if (assetId && $dataLoaded && !hasInitiatedLoad) {
		console.log(`[AssetDetailPage] Loading data for asset: ${assetId}`);
		console.log(`[AssetDetailPage] Store state - SFTs: ${$sfts?.length}, Metadata: ${$sftMetadata?.length}`);
		hasInitiatedLoad = true;
		loadAssetData(assetId);
	}
	
	// Reset when asset ID changes
	$: if (assetId) {
		const previousAssetId = loadedAssetId;
		if (previousAssetId && previousAssetId !== assetId) {
			hasInitiatedLoad = false;
		}
	}
	let loadedAssetId = assetId;
	const { exportProductionData: exportDataFunc, exportPaymentHistory } = useDataExport();
	const { state: emailState, setEmail, submitEmail } = useEmailNotification();
	
	// Reactive data from composable
	$: ({ asset: assetData, tokens: assetTokens, loading, error } = $assetDetailState);
	
	// Check for future releases when asset data is available
	$: if (assetId && assetData) {
		console.log(`[AssetDetailPage] Checking for future releases for assetId: ${assetId}`);
		hasIncompleteReleases(assetId).then(hasIncomplete => {
			console.log(`[AssetDetailPage] hasFutureReleases result: ${hasIncomplete}`);
			hasFutureReleases = hasIncomplete;
		}).catch(error => {
			console.error(`[AssetDetailPage] Error checking future releases:`, error);
			hasFutureReleases = false;
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
let showEmailPopup = false; // legacy modal (to be removed)
// Future releases flip state
let futureCardFlipped = false;

onMount(() => {
    // Redirect to local thank-you page on successful MailerLite submit for Future Releases form
    (window as any).ml_webform_success_30848422 = function () {
        try {
            window.location.assign('/thank-you?source=releases');
        } catch {
            // no-op
        }
    };
});

	// No custom reCAPTCHA flow; use hosted MailerLite form
	
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
	
// Removed JS popup toggle; using HTML embed directly
	
	function handleCloseEmailPopup() {
		showEmailPopup = false;
	}
	


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
											{#if (() => { const list = productionReports || []; return list.length > 0 && list[list.length-1]?.production !== undefined; })()}
												{(() => { const list = productionReports || []; const last = list[list.length-1]; const val = (last.production || 0) * 12 / 365; return val.toFixed(1); })()}
											{:else}
												<span class="text-gray-400">N/A</span>
											{/if}
										</div>
										<div class="text-sm font-medium text-black opacity-70">
											Current Daily Production (BOE/day)
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
                    <!-- MailerLite embed init (required for success handling) -->
                    <script>
                      try { fetch("https://assets.mailerlite.com/jsonp/1795576/forms/165461032541620178/takel"); } catch {}
                    </script>
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
											{#if (() => { const list = productionReports || []; return list.length > 0 && list[list.length-1]?.production !== undefined; })()}
												{(() => { const list = productionReports || []; const last = list[list.length-1]; const val = (last.production || 0) * 12 / 365; return val.toFixed(1); })()}
											{:else}
												<span class="text-gray-400">N/A</span>
											{/if}
										</div>
										<div class="text-sm font-medium text-black opacity-70">
											Current Daily Production (BOE/day)
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
                        <!-- Flip container for Future Releases card -->
                <div class="relative preserve-3d transform-gpu transition-transform duration-500 {futureCardFlipped ? 'rotate-y-180' : ''} min-h-[650px]">
                  <!-- Front -->
                  <div class="absolute inset-0 backface-hidden">
                    <div class="flex flex-col justify-center text-center p-12 h-full">
                      <div class="text-5xl mb-6">🚀</div>
                      <h4 class="text-xl font-extrabold text-black uppercase tracking-wider mb-4">Future Releases</h4>
                      <p class="text-base mb-8 text-black opacity-70">Additional token releases planned</p>
                      <div class="max-w-xs mx-auto w-full">
                        <SecondaryButton fullWidth on:click={() => { futureCardFlipped = true; }}>
                          Get Notified
                        </SecondaryButton>
                      </div>
                    </div>
                  </div>

                  <!-- Back -->
                  <div class="absolute inset-0 backface-hidden rotate-y-180 bg-white">
                    <div class="p-6 sm:p-8 h-full flex flex-col">
                      <div class="flex items-center justify-between mb-4">
                        <h4 class="text-lg font-extrabold text-black">Get Notified</h4>
                        <div>
                          <SecondaryButton on:click={() => { futureCardFlipped = false; }}>
                            ← Back
                          </SecondaryButton>
                        </div>
                      </div>
                      <p class="text-base sm:text-lg text-black opacity-70 mb-6 leading-relaxed">Signup to be notified when the next token release becomes available.</p>

                      <!-- MailerLite HTML embed form -->
                      <div class="text-left max-w-md w-full mx-auto flex-1 future-notify">
                        <div id="mlb2-30848422" class="ml-form-embedContainer ml-subscribe-form ml-subscribe-form-30848422">
                          <div class="ml-form-align-center ">
                            <div class="ml-form-embedWrapper embedForm">
                              <div class="ml-form-embedBody ml-form-embedBodyDefault row-form">
                                <form class="ml-block-form" action="https://assets.mailerlite.com/jsonp/1795576/forms/165461032541620178/subscribe" method="post" on:submit={() => { try { sessionStorage.setItem('lastPageBeforeSubscribe', window.location.pathname + window.location.search + window.location.hash); } catch {} }}>
                                  <div class="ml-form-formContent">
                                    <div class="ml-form-fieldRow ml-last-item">
                                      <div class="ml-field-group ml-field-email ml-validate-email ml-validate-required">
                                        <input aria-label="email" aria-required="true" type="email" name="fields[email]" placeholder="Enter your email address" autocomplete="email" class="form-control w-full px-4 py-3 border border-light-gray bg-white text-black placeholder-black placeholder-opacity-50 focus:outline-none focus:border-primary" required>
                                      </div>
                                    </div>
                                  </div>
                                  <div class="ml-form-embedPermissions" style="">
                                    <div class="ml-form-embedPermissionsContent default privacy-policy">
                                      <p class="text-base sm:text-lg text-black opacity-70 mb-6 leading-relaxed">You can unsubscribe anytime. For more details, review our Privacy Policy.</p>
                                      </div>
                                  </div>
                                  <div class="ml-form-recaptcha ml-validate-required mb-3">
                                    <script src="https://www.google.com/recaptcha/api.js"></script>
                                    <div class="g-recaptcha" data-sitekey="6Lf1KHQUAAAAAFNKEX1hdSWCS3mRMv4FlFaNslaD"></div>
                                  </div>
                                  <input type="hidden" name="fields[interest]" value={assetId}>
                                  <input type="hidden" name="ml-submit" value="1">
                                  <div class="ml-form-embedSubmit">
                                    <button type="submit" class="w-full px-6 py-3 bg-black text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer transition-colors duration-200 hover:bg-secondary border-0">Subscribe</button>
                                    <button disabled="disabled" style="display: none;" type="button" class="loading">
                                      <div class="ml-form-embedSubmitLoad"></div>
                                      <span class="sr-only">Loading...</span>
                                    </button>
                                  </div>
                                  <input type="hidden" name="anticsrf" value="true">
                                </form>
                              </div>
                              <div class="ml-form-successBody row-success" style="display: none">
                                <div class="ml-form-successContent">
                                  <h4>Thank you!</h4>
                                  <p>You have successfully joined our subscriber list.</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
        {#if showEmailPopup}{/if}
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

/* No captcha hiding here */

/* Future Releases form styling overrides to match site */
.future-notify .ml-form-embedContainer,
.future-notify .ml-form-embedWrapper,
.future-notify .ml-form-embedBody,
.future-notify .row-form {
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
}
.future-notify .ml-form-embedPermissionsContent p {
    margin: 0.25rem 0 0.75rem 0;
}
.future-notify .ml-form-recaptcha {
    margin: 0.5rem 0 1rem 0;
}
</style>
