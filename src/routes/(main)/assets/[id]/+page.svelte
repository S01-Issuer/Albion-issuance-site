<script lang="ts">
	import { page } from '$app/stores';
	import { sftMetadata, sfts, dataLoaded } from '$lib/stores';
	import type { Asset, Token } from '$lib/types/uiTypes';
	import type { TokenMetadata } from '$lib/types/MetaboardTypes';
	import { Card, CardContent, PrimaryButton, SecondaryButton, Chart, CollapsibleSection, Modal } from '$lib/components/components';
	import SectionTitle from '$lib/components/components/SectionTitle.svelte';

	import TabButton from '$lib/components/components/TabButton.svelte';
	import { PageLayout, ContentSection } from '$lib/components/layout';
	import { getImageUrl } from '$lib/utils/imagePath';
	import { formatCurrency, formatEndDate, formatSmartReturn, formatHash } from '$lib/utils/formatters';
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
    import { formatSupplyDisplay } from '$lib/utils/supplyHelpers';
    import { formatEther } from 'viem';
import { PINATA_GATEWAY } from '$lib/network';
import { catalogService } from '$lib/services';
import { onMount } from 'svelte';
import { getTokenTermsPath } from '$lib/utils/tokenTerms';

type RevenueReport = {
	month: string;
	netIncome: number;
	revenue: number;
	expenses: number;
	production: number;
};

function safeNumber(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string') {
		const parsed = Number(value.replace(/[^-\d.]/g, ''));
		return Number.isFinite(parsed) ? parsed : 0;
	}
	if (typeof value === 'bigint') {
		return Number(value);
	}
	return 0;
}

function buildRevenueReports(
	receipts: any[] | null | undefined,
	fallback: any[] | null | undefined,
): RevenueReport[] {
	const reports: RevenueReport[] = [];

	if (Array.isArray(receipts) && receipts.length > 0) {
		for (const entry of receipts) {
			const month = entry?.month;
			if (!month) continue;
			const assetEntry = entry?.assetData ?? {};
			const revenue = safeNumber(assetEntry?.revenue ?? entry?.revenue);
			const netIncomeRaw = safeNumber(assetEntry?.netIncome ?? entry?.netIncome);
			const netIncome = netIncomeRaw > 0 ? netIncomeRaw : revenue;
			reports.push({
				month,
				netIncome,
				revenue,
				expenses: safeNumber(assetEntry?.expenses ?? entry?.expenses),
				production: safeNumber(assetEntry?.production ?? entry?.production),
			});
		}
	} else if (Array.isArray(fallback) && fallback.length > 0) {
		for (const entry of fallback) {
			const month = entry?.month;
			if (!month) continue;
			const revenue = safeNumber(entry?.revenue);
			const netIncomeRaw = safeNumber(entry?.netIncome);
			const netIncome = netIncomeRaw > 0 ? netIncomeRaw : revenue;
			reports.push({
				month,
				netIncome,
				revenue,
				expenses: safeNumber(entry?.expenses),
				production: safeNumber(entry?.production),
			});
		}
	}

	reports.sort((a, b) => (a.month > b.month ? 1 : a.month < b.month ? -1 : 0));
	return reports;
}

function parseYearMonth(value: string | null | undefined): Date | null {
	if (!value) {
		return null;
	}
	const parts = value.split('-');
	if (parts.length < 2) {
		return null;
	}
	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const day = parts.length > 2 ? Number(parts[2]) : 1;
	if (!Number.isFinite(year) || !Number.isFinite(month)) {
		return null;
	}
	return new Date(year, Math.max(0, month - 1), Number.isFinite(day) && day > 0 ? day : 1);
}

function chartLabelFromMonth(value: string): string {
	if (!value) {
		return '';
	}
	return value.length === 7 && value.includes('-') ? `${value}-01` : value;
}

function formatReportMonth(value: string): string {
	const parsed = parseYearMonth(value);
	if (!parsed) {
		return value;
	}
	return parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDueDate(date: Date): string {
	const day = date.getDate();
	const monthLabel = date.toLocaleString('en-US', { month: 'long' });
	const suffix = (() => {
		const mod10 = day % 10;
		const mod100 = day % 100;
		if (mod10 === 1 && mod100 !== 11) return 'st';
		if (mod10 === 2 && mod100 !== 12) return 'nd';
		if (mod10 === 3 && mod100 !== 13) return 'rd';
		return 'th';
	})();
	return `${monthLabel} ${day}${suffix}`;
}

function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}
//

	let activeTab = 'overview';
	let unclaimedPayout = 0; // Will be calculated from actual token holdings
	
	// Purchase widget state
	let showPurchaseWidget = false;
	let selectedTokenAddress: string | null = null;
	
	// Future releases state
	let hasFutureReleases = false;
let primaryToken: TokenMetadata | null = null;
let receiptsData: any[] = [];
let revenueReports: RevenueReport[] = [];
let revenueReportsWithIncome: RevenueReport[] = [];
let revenueChartData: Array<{ label: string; value: number }> = [];
let latestRevenueReport: RevenueReport | null = null;
let revenueAverage = 0;
let revenueHasData = false;
let nextReportDue: Date | null = null;
let revenueSignature = '';
let payoutSignature = '';
let receiptsSignature = '';
	
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
	$: primaryToken = assetTokens && assetTokens.length > 0 ? assetTokens[0] : null;
	$: receiptsData = primaryToken?.asset?.receiptsData ?? [];
$: revenueReports = buildRevenueReports(receiptsData, assetData?.monthlyReports ?? []);
$: revenueReportsWithIncome = revenueReports.filter((report) => report.revenue > 0);
$: revenueHasData = revenueReportsWithIncome.length > 0;
$: revenueAverage = revenueReportsWithIncome.length
	? revenueReportsWithIncome.reduce((sum, report) => sum + report.revenue, 0) / revenueReportsWithIncome.length
	: 0;
$: latestRevenueReport = revenueReports.length
	? revenueReports[revenueReports.length - 1]
	: null;
$: nextReportDue = (() => {
	if (latestRevenueReport?.month) {
		const base = parseYearMonth(latestRevenueReport.month);
		if (base) {
			const endOfNextMonth = new Date(base.getFullYear(), base.getMonth() + 2, 0);
			return addDays(endOfNextMonth, 30);
		}
	}
	if (primaryToken?.firstPaymentDate) {
		const base = parseYearMonth(primaryToken.firstPaymentDate);
		if (base) {
			const endOfNextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0);
			return addDays(endOfNextMonth, 30);
		}
	}
	return null;
})();
$: revenueChartData = revenueReports.map((report) => ({
	label: chartLabelFromMonth(report.month),
	value: report.revenue,
}));

$: {
	if (primaryToken) {
		const newReceiptsSignature = JSON.stringify(primaryToken.asset?.receiptsData ?? []);
		if (newReceiptsSignature !== receiptsSignature) {
			receiptsSignature = newReceiptsSignature;
			console.log('[AssetDetailPage] Receipts data', {
				assetId,
				contract: primaryToken.contractAddress,
				records: primaryToken.asset?.receiptsData,
			});
		}
	}
}

$: {
	const newRevenueSignature = JSON.stringify(
		revenueReports.map((report) => ({ month: report.month, revenue: report.revenue, netIncome: report.netIncome })),
	);
	if (newRevenueSignature !== revenueSignature) {
		revenueSignature = newRevenueSignature;
		console.log('[AssetDetailPage] Revenue reports', {
			assetId,
			reports: revenueReports,
			chart: revenueChartData,
			revenueAverage,
			nextReportDue,
		});
	}
}

$: {
	if (assetTokens && assetTokens.length > 0) {
		const newPayoutSignature = JSON.stringify(
			assetTokens.map((token) => ({
				contract: token.contractAddress,
				count: token.payoutData?.length ?? 0,
				months: token.payoutData?.map((payout) => payout.month) ?? [],
			})),
		);
		if (newPayoutSignature !== payoutSignature) {
			payoutSignature = newPayoutSignature;
			console.log('[AssetDetailPage] Token payout data', {
				assetId,
				entries: assetTokens.map((token) => ({
					contract: token.contractAddress,
					symbol: token.symbol,
					payoutData: token.payoutData,
				})),
			});
		}
	}
}
	
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
	
// History modal state
let historyModalOpen = false;
let historyModalToken: string | null = null;
$: selectedHistoryToken = historyModalToken
  ? assetTokens.find((token) => token.contractAddress.toLowerCase() === historyModalToken.toLowerCase())
  : null;
$: historyPayouts = selectedHistoryToken
  ? getTokenPayoutHistory(selectedHistoryToken)?.recentPayouts ?? []
  : [];
$: if (!historyModalOpen && historyModalToken) {
  historyModalToken = null;
}

// Tooltip state
let showTooltip = '';
let tooltipTimer: any = null;

let failedImages = new Set<string>();

	function handleImageError(imageUrl: string) {
		failedImages.add(imageUrl);
	failedImages = new Set(failedImages); // Trigger reactivity
}


function handleCardClick(tokenAddress: string) {
	handleBuyTokens(tokenAddress);
}

function openHistoryModal(tokenAddress: string) {
	if (!assetTokens?.length) {
		return;
	}

	const token = assetTokens.find((candidate) =>
		candidate.contractAddress.toLowerCase() === tokenAddress.toLowerCase(),
	);

	if (!token) {
		return;
	}

	historyModalToken = token.contractAddress;
	historyModalOpen = true;
}

function handleHistoryButtonClick(event: MouseEvent, tokenAddress: string) {
	event.stopPropagation();
	openHistoryModal(tokenAddress);
}

function closeHistoryModal() {
	historyModalOpen = false;
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
			<div class="space-y-4">
				{#if revenueHasData}
					<div class="bg-white border border-light-gray p-4">
						<h4 class="text-base font-bold text-black mb-4">Received Revenue</h4>
						<div class="space-y-2">
							{#each revenueReportsWithIncome.slice(-6) as report}
								<div class="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0">
									<div class="text-sm text-black">{formatReportMonth(report.month)}</div>
										<div class="text-sm font-semibold text-primary">{formatCurrency(report.revenue)}</div>
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
										data={revenueChartData}
										width={700}
										height={350}
										valuePrefix="$"
										barColor="#08bccc"
										animate={true}
										showGrid={true}
									/>
									{#if !revenueHasData}
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
									<div class="text-4xl font-extrabold text-black mb-2">{nextReportDue ? formatDueDate(nextReportDue) : 'TBD'}</div>
									<div class="text-base font-medium text-black opacity-70">Next Report Due</div>
								</div>
								<div class="grid grid-cols-1 gap-4 mb-6">
									<div class="text-center p-3 bg-white">
										<div class="text-3xl font-extrabold text-black mb-1">
											{#if latestRevenueReport}
												{formatCurrency(latestRevenueReport.revenue)}
											{:else}
												<span class="text-gray-400">N/A</span>
											{/if}
										</div>
										<div class="text-sm font-medium text-black opacity-70">Latest Monthly Revenue</div>
									</div>
								</div>
								<div class="text-center p-4 bg-white">
									<div class="text-4xl font-extrabold text-black mb-2">
										{#if revenueAverage > 0}
											{formatCurrency(revenueAverage)}
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
					{@const sft = $sfts?.find(s => s.id.toLowerCase() === token.contractAddress.toLowerCase())}
				{@const maxSupply = catalogService.getTokenMaxSupply(token.contractAddress)}
				{@const supply = getTokenSupply(token, sft, maxSupply)}
				{@const hasAvailableSupply = supply && supply.availableSupply > 0}
				{@const tokenPayoutData = getTokenPayoutHistory(token)}
				{@const latestPayout = tokenPayoutData?.recentPayouts?.[0]}
				{@const calculatedReturns = calculateTokenReturns(assetData!, token, sft?.totalShares, maxSupply)}
				{@const tokenTermsUrl = getTokenTermsPath(token.contractAddress)}
				<div id="token-{token.contractAddress}">
					<Card hoverable clickable paddingClass="p-0" on:click={() => handleCardClick(token.contractAddress)}>
						<CardContent paddingClass="p-0">
							<div class="min-h-[700px] sm:min-h-[600px] flex flex-col">
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
										{#if tokenTermsUrl}
											<a href={tokenTermsUrl} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-sm font-semibold text-secondary no-underline hover:underline mt-2 font-figtree">
												View terms →
											</a>
										{/if}
									</div>
								</div>

								<div class="p-8 pt-6 space-y-4">
									<div class="flex justify-between items-start">
										<span class="text-base font-medium text-black opacity-70 relative font-figtree">Minted Supply </span>
										<span class="text-base font-extrabold text-black text-right">{supply?.mintedSupply || 0}</span>
									</div>
									<div class="flex justify-between items-start">
										<span class="text-base font-medium text-black opacity-70 relative font-figtree">Max Supply</span>
										<span class="text-base font-extrabold text-black text-right">{supply?.maxSupply || 0}</span>
									</div>
									<div class="flex justify-between items-start relative">
										<span class="text-base font-medium text-black opacity-70 relative font-figtree">
											Implied Barrels/Token
											<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold ml-1 cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100" on:mouseenter={() => showTooltipWithDelay('barrels')} on:mouseleave={hideTooltip} role="button" tabindex="0">ⓘ</span>
										</span>
										<span class="text-base font-extrabold text-black text-right">{calculatedReturns?.impliedBarrelsPerToken === Infinity ? '∞' : calculatedReturns?.impliedBarrelsPerToken?.toFixed(6) || '0.000000'}</span>
										{#if showTooltip === 'barrels'}
											<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded text-xs whitespace-nowrap z-[1000] mb-[5px] max-w-[200px] whitespace-normal text-left">Estimated barrels of oil equivalent per token based on reserves and token supply</div>
										{/if}
									</div>
									<div class="flex justify-between items-start relative">
										<span class="text-base font-medium text-black opacity-70 relative font-figtree">
											Breakeven Oil Price
											<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold ml-1 cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100" on:mouseenter={() => showTooltipWithDelay('breakeven')} on:mouseleave={hideTooltip} role="button" tabindex="0">ⓘ</span>
										</span>
										<span class="text-base font-extrabold text-black text-right">US${calculatedReturns?.breakEvenOilPrice?.toFixed(2) || '0.00'}</span>
										{#if showTooltip === 'breakeven'}
											<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded text-xs whitespace-nowrap z-[1000] mb-[5px] max-w-[200px] whitespace-normal text-left">Oil price required to cover operational costs and maintain profitability</div>
										{/if}
									</div>
								</div>

								<div class="p-8 pt-0 border-t border-light-gray">
									<h5 class="text-sm font-extrabold text-black uppercase tracking-wider mb-4 pt-6 flex items-center gap-1 relative">
										<span>Estimated IRR</span>
										<span
											class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100"
											on:mouseenter={() => showTooltipWithDelay('irr')}
											on:mouseleave={hideTooltip}
											role="button"
											tabindex="0"
										>
											ⓘ
										</span>
										{#if showTooltip === 'irr'}
											<div class="absolute top-full left-0 mt-1 bg-black text-white p-2 rounded text-xs max-w-xs z-[1000]">
												IRR is a standard oil and gas industry and project finance returns metric that gives the rate of return that would set the NPV of cashflows to 0. It accounts for early repayment of invested capital.
											</div>
										{/if}
									</h5>
									<div class="grid grid-cols-3 gap-3">
										<div class="text-center p-3 bg-white">
											<span class="text-xs font-medium text-black opacity-70 block mb-1 relative">Base IRR <span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold ml-1 cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100" on:mouseenter={() => showTooltipWithDelay('base')} on:mouseleave={hideTooltip} role="button" tabindex="0">ⓘ</span></span>
											<span class="text-xl font-extrabold text-primary">{formatSmartReturn(calculatedReturns?.baseReturn)}</span>
											{#if showTooltip === 'base'}<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded text-xs whitespace-nowrap z-[1000] mb-[5px] max-w-[200px] whitespace-normal text-left">IRR assuming max supply</div>{/if}
										</div>
										<div class="text-center p-3 bg-white">
											<span class="text-xs font-medium text-black opacity-70 block mb-1 relative">Bonus IRR <span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold ml-1 cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100" on:mouseenter={() => showTooltipWithDelay('bonus')} on:mouseleave={hideTooltip} role="button" tabindex="0">ⓘ</span></span>
											<span class="text-xl font-extrabold text-primary">{calculatedReturns?.bonusReturn !== undefined ? (formatSmartReturn(calculatedReturns.bonusReturn).startsWith('>') ? formatSmartReturn(calculatedReturns.bonusReturn) : '+' + formatSmartReturn(calculatedReturns.bonusReturn)) : 'TBD'}</span>
											{#if showTooltip === 'bonus'}<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded text-xs whitespace-nowrap z-[1000] mb-[5px] max-w-[200px] whitespace-normal text-left">Additional IRR where supply is lower than max supply</div>{/if}
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
											<PrimaryButton fullWidth size="small" on:click={(event) => { event.stopPropagation(); handleBuyTokens(token.contractAddress); }}>
												<span class="hidden sm:inline">Buy Tokens</span>
												<span class="sm:hidden">Buy</span>
											</PrimaryButton>
										{:else}
											<PrimaryButton fullWidth size="small" disabled>
												<span class="hidden sm:inline">Sold Out</span><span class="sm:hidden">Sold Out</span>
											</PrimaryButton>
										{/if}
										<div on:click={(event) => handleHistoryButtonClick(event, token.contractAddress)}>
											<SecondaryButton
												fullWidth
												size="small"
											>
												<span class="hidden sm:inline">Distributions History</span>
												<span class="sm:hidden">History</span>
											</SecondaryButton>
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			{/each}

			{#if historyModalOpen}
				<Modal
					bind:isOpen={historyModalOpen}
					title={`Distributions History`}
					size="large"
					on:close={closeHistoryModal}
				>
					{#if selectedHistoryToken}
						<div class="mb-6">
							<h4 class="text-lg font-extrabold text-black uppercase tracking-wider mb-1">{selectedHistoryToken.releaseName}</h4>
							<p class="text-xs text-black opacity-70 break-all">{selectedHistoryToken.contractAddress}</p>
						</div>

						{#if historyPayouts.length > 0}
								<div class="space-y-4">
									<div class="grid grid-cols-5 gap-2 text-xs font-bold text-black uppercase tracking-wider border-b border-light-gray pb-2">
										<div class="text-left">Month</div>
										<div class="text-center">Total Payments</div>
										<div class="text-right">Per Token</div>
										<div class="text-left">Claims Vault</div>
										<div class="text-left">Payout Transaction</div>
									</div>
									<div class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
										{#each historyPayouts as payout}
											<div class="grid grid-cols-5 gap-2 text-sm items-center">
												<div class="text-left font-medium text-black">{formatReportMonth(payout.month)}</div>
												<div class="text-center font-semibold text-black">{formatCurrency(payout.totalPayout)}</div>
												<div class="text-right font-semibold text-black">US${payout.payoutPerToken.toFixed(5)}</div>
												<div class="text-left font-semibold text-secondary">
													{#if payout.orderHash}
														<a
															href={`https://raindex.finance/orders/8453-${payout.orderHash}`}
															target="_blank"
															rel="noopener noreferrer"
															class="hover:underline break-all"
														>
															{formatHash(payout.orderHash)}
														</a>
													{:else}
														<span class="text-black opacity-50">—</span>
													{/if}
												</div>
												<div class="text-left font-semibold text-secondary">
													{#if payout.txHash}
														<a
															href={`https://basescan.org/tx/${payout.txHash}`}
															target="_blank"
															rel="noopener noreferrer"
															class="hover:underline break-all"
														>
															{formatHash(payout.txHash)}
														</a>
													{:else}
														<span class="text-black opacity-50">—</span>
													{/if}
												</div>
											</div>
										{/each}
									</div>
									<div class="border-t border-light-gray pt-4 grid grid-cols-5 gap-2 text-sm font-extrabold items-center">
										<div class="text-left text-black">Total</div>
										<div class="text-center text-black">{formatCurrency(historyPayouts.reduce((sum, p) => sum + p.totalPayout, 0))}</div>
										<div class="text-right text-black">US${historyPayouts.reduce((sum, p) => sum + p.payoutPerToken, 0).toFixed(5)}</div>
										<div class="text-left text-black opacity-50">—</div>
										<div class="text-left text-black opacity-50">—</div>
									</div>
							</div>
						{:else}
							<div class="text-center py-12 text-black opacity-70">
								<p class="text-base font-semibold mb-2">No distributions yet</p>
								<p class="text-sm">No distributions have been made yet.</p>
								<p class="text-sm">Distributions will appear here once payouts begin.</p>
							</div>
						{/if}
					{:else}
						<div class="text-center py-12 text-black opacity-70">
							<p class="text-base font-semibold mb-2">Loading distributions</p>
							<p class="text-sm">Fetching the latest payout history for this token.</p>
						</div>
					{/if}
				</Modal>
			{/if}
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
