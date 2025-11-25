<script lang="ts">
	import { page } from '$app/stores';
	import { sftMetadata, sfts, dataLoaded } from '$lib/stores';
	import { connected, web3Modal, chainId } from 'svelte-wagmi';
	import type {
		Asset,
		MonthlyReport,
		ProductionHistoryRecord
	} from '$lib/types/uiTypes';
	import type { Document as TokenDocument, TokenMetadata } from '$lib/types/MetaboardTypes';
	import { Card, CardContent, PrimaryButton, SecondaryButton, Chart, CollapsibleSection, Modal } from '$lib/components/components';
	import TabButton from '$lib/components/components/TabButton.svelte';
	import { PageLayout, ContentSection } from '$lib/components/layout';
	import { getImageUrl } from '$lib/utils/imagePath';
	import { formatCurrency, formatSmartReturn, formatHash, formatEndDate, formatAccrualStartDate, formatEstFirstPayout } from '$lib/utils/formatters';
	import { hasIncompleteReleases } from '$lib/utils/futureReleases';
	import { useAssetDetailData, useDataExport } from '$lib/composables';
	import AssetDetailHeader from '$lib/components/patterns/assets/AssetDetailHeader.svelte';
	import AssetOverviewTab from '$lib/components/patterns/assets/AssetOverviewTab.svelte';
	import ReturnsEstimatorModal from '$lib/components/patterns/ReturnsEstimatorModal.svelte';
import { calculateTokenReturns, getTokenPayoutHistory, getTokenSupply } from '$lib/utils/returnCalculations';
import { calculateLifetimeIRR, calculateMonthlyTokenCashflows, calculateIRR } from '$lib/utils/returnsEstimatorHelpers';
import { PINATA_GATEWAY } from '$lib/network';
import { catalogService } from '$lib/services';
import { getTokenTermsPath } from '$lib/utils/tokenTerms';
import { getTxUrl, getAddressUrl } from '$lib/utils/explorer';
import { Chart as ChartJS, registerables } from 'chart.js';
import { onDestroy } from 'svelte';

ChartJS.register(...registerables);

const isDev = import.meta.env.DEV;
const logDev = (...messages: unknown[]) => {
	if (isDev) console.warn('[AssetDetailPage]', ...messages);
};

const SvelteDate: DateConstructor = Date;

function resetRecaptcha(): void {
	if (typeof window === 'undefined') return;
	const grecaptcha = (window as typeof window & { grecaptcha?: { reset: () => void } }).grecaptcha;
	grecaptcha?.reset();
}

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

type ReceiptRecord = {
	month?: string;
	revenue?: number | string;
	expenses?: number | string;
	production?: number | string;
	netIncome?: number | string;
	assetData?: {
		revenue?: number | string;
		expenses?: number | string;
		production?: number | string;
		netIncome?: number | string;
	};
};

function buildRevenueReports(
	receipts: ReceiptRecord[] | null | undefined,
	fallback: ReceiptRecord[] | null | undefined,
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
	return new SvelteDate(
		year,
		Math.max(0, month - 1),
		Number.isFinite(day) && day > 0 ? day : 1,
	);
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

const metricCardClasses = 'text-center p-4 bg-white border border-light-gray rounded-none';
const metricValueClasses = 'text-2xl font-extrabold text-black mb-1';
const metricLabelClasses = 'text-xs font-medium text-black opacity-70';

	let activeTab = 'overview';
	// Purchase widget state
	let showPurchaseWidget = false;
	let selectedTokenAddress: string | null = null;
	
	// Future releases state
	let hasFutureReleases = false;
let assetData: Asset | null = null;
let assetTokens: TokenMetadata[] = [];
let loading = false;
let error: string | null = null;
let primaryToken: TokenMetadata | null = null;
let receiptsData: ReceiptRecord[] = [];
let revenueReports: RevenueReport[] = [];
let revenueReportsWithIncome: RevenueReport[] = [];
let revenueChartData: Array<{ label: string; value: number }> = [];
let latestRevenueReport: RevenueReport | null = null;
let revenueAverage = 0;
let revenueChart: ChartJS | null = null;
let revenueChartCanvas: HTMLCanvasElement;
let revenueTotal = 0;
let revenueHasData = false;
let productionReports: Array<MonthlyReport | ProductionHistoryRecord> = [];
let nextReportDueLabel = '';
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
		logDev('Loading asset data', { assetId, sfts: $sfts?.length ?? 0, metadata: $sftMetadata?.length ?? 0 });
		hasInitiatedLoad = true;
		loadAssetData(assetId);
	}
	
	// Reset when asset ID changes
$: if (assetId) {
	const previousAssetId = loadedAssetId;
	if (previousAssetId && previousAssetId !== assetId) {
		hasInitiatedLoad = false;
	}
	loadedAssetId = assetId;
}
let loadedAssetId: string | null = null;
	const { exportProductionData: exportDataFunc, exportPaymentHistory } = useDataExport();

	// Reactive data from composable
	$: ({ asset: assetData, tokens: assetTokens, loading, error } = $assetDetailState);
	$: primaryToken = assetTokens && assetTokens.length > 0 ? assetTokens[0] : null;

	// Sort tokens by firstPaymentDate in ascending order
	$: sortedTokens = assetTokens ? [...assetTokens].sort((a, b) => {
		const dateA = a.firstPaymentDate || '';
		const dateB = b.firstPaymentDate || '';
		return dateA.localeCompare(dateB);
	}) : [];
	$: receiptsData = primaryToken?.asset?.receiptsData ?? [];
$: revenueReports = buildRevenueReports(receiptsData, assetData?.monthlyReports ?? []);
$: revenueReportsWithIncome = revenueReports.filter((report) => report.revenue > 0);
$: revenueHasData = revenueReportsWithIncome.length > 0;
$: revenueAverage = revenueReportsWithIncome.length
    ? revenueReportsWithIncome.reduce((sum, report) => sum + report.revenue, 0) / revenueReportsWithIncome.length
    : 0;
$: revenueTotal = revenueReportsWithIncome.reduce((sum, report) => sum + report.revenue, 0);
$: latestRevenueReport = revenueReports.length
	? revenueReports[revenueReports.length - 1]
	: null;
$: nextReportDueLabel = (() => {
	const labelFromMonth = (month: string, offset: number) => {
		const base = parseYearMonth(month);
		if (!base) return '';
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const endOfTargetMonth = new SvelteDate(
			base.getFullYear(),
			base.getMonth() + offset,
			0,
		);
		endOfTargetMonth.setDate(endOfTargetMonth.getDate() + 30);
		return formatDueDate(endOfTargetMonth);
	};

	if (latestRevenueReport?.month) {
		const label = labelFromMonth(latestRevenueReport.month, 2);
		if (label) return label;
	}

	// Fall back to cashflowStartDate if available, otherwise firstPaymentDate
	const fallbackDate = primaryToken?.asset?.cashflowStartDate || primaryToken?.firstPaymentDate;
	if (fallbackDate) {
		const label = labelFromMonth(fallbackDate, 1);
		if (label) return label;
	}

	return '';
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
			logDev('Receipts data updated', {
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
		logDev('Revenue reports updated', {
			assetId,
			reports: revenueReports,
			chart: revenueChartData,
			revenueAverage,
			nextReportDueLabel,
		});
	}
}

// Create/update revenue chart when data changes
$: if (revenueChartCanvas && revenueReports.length > 0 && primaryToken) {
	createRevenueChart();
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
			logDev('Token payout data updated', {
				assetId,
				tokens: assetTokens.map((token) => ({
					contract: token.contractAddress,
					symbol: token.symbol,
					payoutData: token.payoutData,
				})),
			});
		}
	}
}


// Check for future releases when asset data is available
$: if (assetId && assetData && assetId !== lastFutureReleaseCheck) {
	checkFutureReleases(assetId);
}

async function checkFutureReleases(currentAssetId: string) {
	lastFutureReleaseCheck = currentAssetId;
	logDev('Checking for future releases', { assetId: currentAssetId });
	try {
		const hasIncomplete = await hasIncompleteReleases(currentAssetId);
		logDev('Future releases result', { assetId: currentAssetId, hasIncomplete });
		if (currentAssetId === assetId) {
			hasFutureReleases = hasIncomplete;
		}
	} catch (error) {
		console.error('[AssetDetailPage] Error checking future releases:', error);
		if (currentAssetId === assetId) {
			hasFutureReleases = false;
		}
	}
}
	
	async function downloadDocument(doc: TokenDocument) {
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
		if (tooltipTimer) {
			clearTimeout(tooltipTimer);
		}
		tooltipTimer = setTimeout(() => {
			showTooltip = tooltipId;
		}, 500);
	}
	
	function hideTooltip() {
	if (tooltipTimer) {
		clearTimeout(tooltipTimer);
	}
	showTooltip = '';
}

function createRevenueChart() {
	if (!revenueChartCanvas || !primaryToken) return;

	// Destroy existing chart
	if (revenueChart) {
		revenueChart.destroy();
	}

	// Get months from actual revenue reports
	const months = revenueReports.map(r => r.month);

	// Get projections data
	const projections = primaryToken.asset?.plannedProduction?.projections || [];

	// Calculate projected revenue for months where we have actuals
	const projectedRevenue = months.map(month => {
		const projection = projections.find(p => p.month === month);
		if (!projection) return 0;

		// Get oil price from asset technical data or use default
		const benchmarkPremiumStr = primaryToken.asset?.technical?.pricing?.benchmarkPremium;
		const transportCostsStr = primaryToken.asset?.technical?.pricing?.transportCosts;
		const benchmarkPremium = benchmarkPremiumStr ? (parseFloat(String(benchmarkPremiumStr).replace(/[^-\d.]/g, '')) || 0) : 0;
		const transportCosts = transportCostsStr ? (parseFloat(String(transportCostsStr).replace(/[^-\d.]/g, '')) || 0) : 0;
		const defaultOilPrice = 65; // Default assumption
		const adjustedOilPrice = defaultOilPrice + benchmarkPremium - transportCosts;

		return projection.production * adjustedOilPrice;
	});

	// Get actual revenue
	const actualRevenue = revenueReports.map(r => r.revenue);

	// Create labels
	const labels = months.map(month => formatReportMonth(month));

	const ctx = revenueChartCanvas.getContext('2d');
	if (!ctx) return;

	revenueChart = new ChartJS(ctx, {
		type: 'bar',
		data: {
			labels,
			datasets: [
				{
					label: 'Actual Revenue',
					data: actualRevenue,
					backgroundColor: '#08bccc',
					borderColor: '#08bccc',
					borderWidth: 0,
				},
				{
					label: 'Projected Revenue',
					data: projectedRevenue,
					backgroundColor: '#283c84',
					borderColor: '#283c84',
					borderWidth: 0,
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					display: true,
					position: 'bottom',
				},
				tooltip: {
					callbacks: {
						label: function(context) {
							return context.dataset.label + ': $' + (context.parsed.y ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
						}
					}
				}
			},
			scales: {
				y: {
					beginAtZero: true,
					ticks: {
						callback: function(value) {
							return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
						}
					}
				}
			}
		}
	});
}

onDestroy(() => {
	if (revenueChart) {
		revenueChart.destroy();
	}
});

$: productionReports =
	(assetData?.productionHistory ?? assetData?.monthlyReports ?? []) as Array<
		MonthlyReport | ProductionHistoryRecord
	>;
	
// Future releases flip state
let futureCardFlipped = false;
let futureSignupSubmitting = false;
let futureSignupStatus: 'idle' | 'success' | 'error' = 'idle';
let lastFutureReleaseCheck = '';

async function handleFutureSignupSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (futureSignupSubmitting) return;

    futureSignupSubmitting = true;
    futureSignupStatus = 'idle';

    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);

    try {
        const response = await fetch(form.action, {
            method: 'POST',
            body: formData,
            headers: { Accept: 'application/json' }
        });

		if (response.ok) {
			futureSignupStatus = 'success';
			try {
				form.reset();
			} catch (resetError) {
				logDev('Unable to reset future releases form', resetError);
			}
        } else {
            futureSignupStatus = 'error';
        }
    } catch (error) {
        console.error('Future releases signup failed:', error);
        futureSignupStatus = 'error';
    } finally {
        futureSignupSubmitting = false;
		try {
			resetRecaptcha();
		} catch (recaptchaError) {
			logDev('Unable to reset recaptcha', recaptchaError);
		}
    }
}

	// No custom reCAPTCHA flow; use hosted MailerLite form
	
// History modal state
let historyModalOpen = false;
let historyModalToken: string | null = null;
let selectedHistoryToken: TokenMetadata | null = null;
let historyPayouts: Array<{
  month: string;
  totalPayout: number;
  payoutPerToken: number;
  orderHash: string;
  txHash?: string;
}> = [];

$: {
  const normalizedToken = historyModalToken?.toLowerCase() ?? null;
  selectedHistoryToken = normalizedToken
    ? assetTokens.find(
        (token) => token.contractAddress.toLowerCase() === normalizedToken,
      ) ?? null
    : null;
}

$: historyPayouts = selectedHistoryToken
  ? getTokenPayoutHistory(selectedHistoryToken)?.recentPayouts ?? []
  : [];
$: if (!historyModalOpen && historyModalToken) {
  historyModalToken = null;
}

// Returns Estimator Modal state
let returnsEstimatorOpen = false;
let selectedReturnsToken: TokenMetadata | null = null;
let selectedReturnsTokenMintedSupply: number = 0;
let selectedReturnsTokenAvailableSupply: number = 0;

function openReturnsEstimator(token: TokenMetadata, mintedSupply: number, availableSupply: number) {
	selectedReturnsToken = token;
	selectedReturnsTokenMintedSupply = mintedSupply;
	selectedReturnsTokenAvailableSupply = availableSupply;
	returnsEstimatorOpen = true;
}

function closeReturnsEstimator() {
	returnsEstimatorOpen = false;
	selectedReturnsToken = null;
	selectedReturnsTokenMintedSupply = 0;
	selectedReturnsTokenAvailableSupply = 0;
}

// Tooltip state
let showTooltip = '';
let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

let failedImages: string[] = [];

	function handleImageError(imageUrl: string) {
		if (!failedImages.includes(imageUrl)) {
			failedImages = [...failedImages, imageUrl];
		}
	}

type GalleryImageItem = NonNullable<Asset['galleryImages']>[number];
let galleryModalOpen = false;
let selectedGalleryImage: GalleryImageItem | null = null;

function openGalleryModal(image: GalleryImageItem) {
	if (failedImages.includes(image.url)) {
		return;
	}

	selectedGalleryImage = image;
	galleryModalOpen = true;
}

function closeGalleryModal() {
	galleryModalOpen = false;
}

function handleGalleryCardKeydown(event: KeyboardEvent, image: GalleryImageItem) {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		openGalleryModal(image);
	}
}

$: if (!galleryModalOpen && selectedGalleryImage) {
	selectedGalleryImage = null;
}

type AssetLocation = Asset['location'];
type AssetCoordinates = AssetLocation['coordinates'];
let locationModalOpen = false;
let locationModalLocation: AssetLocation | null = null;
let locationModalAssetName = '';
let locationModalCoordinates: AssetCoordinates | null = null;
let locationModalMapUrl = '';
let locationModalSubtitle = '';

function openLocationModal(location: AssetLocation | null | undefined, assetName?: string | null) {
	const coords = location?.coordinates;
	if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
		return;
	}

	locationModalLocation = location ?? null;
	locationModalAssetName = assetName ? assetName : '';
	locationModalOpen = true;
}

function closeLocationModal() {
	locationModalOpen = false;
}

$: if (!locationModalOpen && locationModalLocation) {
	locationModalLocation = null;
	locationModalAssetName = '';
}

$: locationModalCoordinates = locationModalLocation?.coordinates ?? null;
$: locationModalMapUrl = locationModalCoordinates
	? `https://maps.google.com/maps?q=${encodeURIComponent(`${locationModalCoordinates.lat},${locationModalCoordinates.lng}`)}&z=10&output=embed`
	: '';
$: locationModalSubtitle = locationModalLocation
	? [locationModalLocation.county, locationModalLocation.state, locationModalLocation.country]
		.filter((part): part is string => Boolean(part && String(part).trim().length))
		.join(', ')
	: '';

function handleLocationClick() {
	if (!assetData?.location) {
		return;
	}

	openLocationModal(assetData.location, assetData.name ?? null);
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


async function handleBuyTokens(tokenAddress: string, event?: Event) {
	event?.stopPropagation();

	// Check if wallet is connected, if not prompt user to connect
	if (!$connected) {
		await $web3Modal.open();
		return;
	}

	selectedTokenAddress = tokenAddress;
	showPurchaseWidget = true;
}

function handleHistoryButtonClick(tokenAddress: string, event?: Event) {
	event?.stopPropagation();
	openHistoryModal(tokenAddress);
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
					onLocationClick={handleLocationClick}
				/>
			{/if}

		<!-- Asset Details Content -->
        <ContentSection background="white" padding="standard">
        	<!-- Mobile: Collapsible sections -->
        	<div class="lg:hidden space-y-4">
        		<!-- Overview in collapsible section -->
        		<CollapsibleSection title="Overview" isOpenByDefault={false} alwaysOpenOnDesktop={false}>
	        			{#if assetData}
	        				<AssetOverviewTab asset={assetData} onLocationClick={handleLocationClick} primaryToken={primaryToken} />
	        			{/if}
        		</CollapsibleSection>
        		
        		<!-- Other sections in collapsible format -->
			<CollapsibleSection title="Production Data" isOpenByDefault={false} alwaysOpenOnDesktop={false}>
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
										data={productionReports.map((report) => ({
											label: report.month,
											value: report.production ?? 0
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
											{#if productionReports.length > 0 && productionReports[productionReports.length - 1]?.production !== undefined}
												{(() => {
													const last = productionReports[productionReports.length - 1];
													const annualized = ((last?.production ?? 0) * 12) / 365;
													return annualized.toFixed(1);
												})()}
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
							{#each revenueReportsWithIncome.slice(-6) as report (report.month)}
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
							{#each assetData.galleryImages.slice(0, 4) as image (image.url)}
								<div
								   class="bg-white border border-light-gray overflow-hidden group cursor-pointer"
								   on:click={() => openGalleryModal(image)}
								   on:keydown={(event) => handleGalleryCardKeydown(event, image)}
								   role="button"
								   tabindex="0"
								   aria-label={`View ${image.caption || image.title || 'asset image'} inline`}
								>
									{#if !failedImages.includes(image.url)}
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
							{#each assetTokens[0].asset.documents as document (document.ipfs ?? document.name ?? document.type)}
								<div class="flex items-center justify-between p-4 border-b border-light-gray last:border-b-0">
									<div class="flex items-center space-x-3">
										<div class="w-8 h-8 bg-secondary rounded-none flex items-center justify-center">
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
					<AssetOverviewTab asset={assetData} onLocationClick={handleLocationClick} primaryToken={primaryToken} />
				{/if}
				{:else if activeTab === 'production'}
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
										data={productionReports.map((report) => {
											let dateStr = report.month || '';
											if (dateStr && !dateStr.includes('-01')) {
												dateStr = `${dateStr}-01`;
											}
											return {
												label: dateStr,
												value: report.production ?? 0
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
							<div class="mb-6">
								<div class={metricCardClasses}>
									<div class={metricValueClasses}>
										{#if assetData?.operationalMetrics?.uptime?.percentage !== undefined}
											{assetData.operationalMetrics.uptime.percentage.toFixed(1)}%
										{:else}
											<span class="text-gray-400">N/A</span>
										{/if}
									</div>
									<div class={metricLabelClasses}>
										Uptime {assetData?.operationalMetrics?.uptime?.period?.replace('_', ' ') || 'N/A'}
									</div>
								</div>
							</div>
							<div class="grid grid-cols-1 gap-4 mb-6">
								<div class={metricCardClasses}>
									<div class={metricValueClasses}>
										{#if productionReports.length > 0 && productionReports[productionReports.length - 1]?.production !== undefined}
											{(() => {
												const last = productionReports[productionReports.length - 1];
												const annualized = ((last?.production ?? 0) * 12) / 365;
												return annualized.toFixed(1);
											})()}
										{:else}
											<span class="text-gray-400">N/A</span>
										{/if}
									</div>
									<div class={metricLabelClasses}>Current Daily Production (BOE/day)</div>
								</div>
							</div>
							<div class={metricCardClasses}>
								<div class={metricValueClasses}>
									{#if assetData?.operationalMetrics?.hseMetrics?.incidentFreeDays !== undefined}
										{assetData.operationalMetrics.hseMetrics.incidentFreeDays}
									{:else}
										<span class="text-gray-400">N/A</span>
									{/if}
								</div>
								<div class={metricLabelClasses}>Days Since Last HSE Incident</div>
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
								<div class="w-full relative" style="height: 350px;">
									<canvas bind:this={revenueChartCanvas}></canvas>
									{#if !revenueHasData}
										<div class="absolute inset-0 bg-gray-100 bg-opacity-90 flex items-center justify-center rounded-none">
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
								<div class="mb-6">
									<div class={metricCardClasses}>
										<div class={metricValueClasses}>{nextReportDueLabel || 'TBD'}</div>
										<div class={metricLabelClasses}>Next Revenue Report Due</div>
									</div>
								</div>
								<div class="grid grid-cols-1 gap-4 mb-6">
									<div class={metricCardClasses}>
										<div class={metricValueClasses}>
											{#if revenueTotal > 0}
												{formatCurrency(revenueTotal, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
											{:else}
												<span class="text-gray-400">N/A</span>
											{/if}
										</div>
										<div class={metricLabelClasses}>Total Revenue to Date</div>
									</div>
								</div>
								<div class={metricCardClasses}>
									<div class={metricValueClasses}>
										{#if revenueAverage > 0}
											{formatCurrency(revenueAverage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
										{:else}
											<span class="text-gray-400">N/A</span>
										{/if}
									</div>
									<div class={metricLabelClasses}>Average Monthly Revenue</div>
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'gallery'}
					<div class="flex-1 flex flex-col">
						<div class="grid md:grid-cols-3 grid-cols-1 gap-6">
							{#if assetData?.galleryImages && assetData.galleryImages.length > 0}
								{#each assetData.galleryImages as image (image.url)}
									<div 
										class="bg-white border border-light-gray overflow-hidden group cursor-pointer" 
										on:click={() => openGalleryModal(image)}
										on:keydown={(event) => handleGalleryCardKeydown(event, image)}
										role="button"
										tabindex="0"
										aria-label={`View ${image.caption || image.title || 'asset image'} inline`}
									>
											{#if !failedImages.includes(image.url)}
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
						{#each assetTokens[0].asset.documents as document (document.ipfs ?? document.name ?? document.type)}
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
		<ContentSection background="white" padding="compact" className="overflow-visible">
			<div class="bg-white border border-light-gray section-no-border overflow-visible" id="token-section">
				<div class="py-6 overflow-visible">
					<h3 class="text-3xl md:text-2xl font-extrabold text-black uppercase tracking-wider mb-8">Token Information</h3>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-visible">

				{#each sortedTokens as token (token.contractAddress)}
				{@const sft = $sfts?.find((s) => s.id.toLowerCase() === token.contractAddress.toLowerCase())}
				{@const maxSupply = catalogService.getTokenMaxSupply(token.contractAddress) ?? undefined}
				{@const supply = getTokenSupply(token, sft, maxSupply)}
				{@const hasAvailableSupply = (supply?.availableSupply ?? 0) > 0}
				{@const calculatedReturns = assetData ? calculateTokenReturns(assetData, token, sft?.totalShares, maxSupply) : null}
				{@const tokenTermsUrl = getTokenTermsPath(token.contractAddress)}
					<div id="token-{token.contractAddress}" class="overflow-visible">
							<Card hoverable={false} paddingClass="p-0" overflowClass="overflow-visible">
						<CardContent paddingClass="p-0" overflowClass="overflow-visible">
							<div class="min-h-[700px] sm:min-h-[600px] flex flex-col overflow-visible">
								<div class="{!hasAvailableSupply ? 'text-base font-extrabold text-white bg-black text-center py-3 uppercase tracking-wider' : 'text-base font-extrabold text-black bg-primary text-center py-3 uppercase tracking-wider'} w-full">
									{hasAvailableSupply ? 'Available for Purchase' : 'Currently Sold Out'}
								</div>

								<div class="p-8 pb-0 relative overflow-visible">
									<div class="flex-1 mt-6 overflow-visible">
										<div class="flex justify-between items-start mb-3 gap-4">
											<h4 class="text-2xl font-extrabold text-black font-figtree flex-1">{token.releaseName}</h4>
											<div class="text-sm font-extrabold text-white bg-secondary px-3 py-1 tracking-wider rounded-none whitespace-nowrap">
												{token.sharePercentage || 25}% of Asset
											</div>
										</div>
										<a
											href={getAddressUrl(token.contractAddress, $chainId)}
											target="_blank"
											rel="noopener noreferrer"
											class="text-sm text-secondary font-medium break-all tracking-tight opacity-80 font-figtree no-underline hover:text-primary hover:opacity-100 transition-all block"
										>
											{token.contractAddress}
										</a>
										{#if tokenTermsUrl}
											<a href={tokenTermsUrl} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-sm font-semibold text-secondary no-underline hover:text-primary font-figtree">
												View terms →
											</a>
										{/if}
									</div>
								</div>

								<div class="p-8 pt-6 space-y-4 overflow-visible">
									<div class="flex justify-between items-start">
										<span class="text-base font-medium text-black opacity-70 relative font-figtree">Minted Supply </span>
										<span class="text-base font-extrabold text-black text-right">{supply?.mintedSupply !== undefined ? Number(supply.mintedSupply).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: supply.mintedSupply % 1 === 0 ? 0 : 2 }) : 0}</span>
									</div>
									<div class="flex justify-between items-start">
										<span class="text-base font-medium text-black opacity-70 relative font-figtree">Max Supply</span>
										<span class="text-base font-extrabold text-black text-right">{supply?.maxSupply || 0}</span>
									</div>
									<div class="flex justify-between items-start relative overflow-visible">
										<span class="text-base font-medium text-black opacity-70 font-figtree flex items-center gap-1">
											Implied Barrels/Token
											<span class="inline-flex items-center justify-center w-3 h-3 rounded-full bg-gray-300 text-black text-[8px] font-bold cursor-help hover:bg-gray-400 transition-colors" on:mouseenter={() => showTooltipWithDelay('barrels-' + token.contractAddress)} on:mouseleave={hideTooltip} on:focus={() => showTooltipWithDelay('barrels-' + token.contractAddress)} on:blur={hideTooltip} role="button" tabindex="0">
												?
											</span>
										</span>
										<span class="text-base font-extrabold text-black text-right">{
											calculatedReturns?.impliedBarrelsPerToken === Infinity
												? '∞'
												: calculatedReturns?.impliedBarrelsPerToken !== undefined
													? calculatedReturns.impliedBarrelsPerToken.toFixed(6)
													: '0.000000'
										}</span>
										{#if showTooltip === 'barrels-' + token.contractAddress}
											<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 p-2 rounded-none text-xs z-[10000] mb-[6px] max-w-[260px] whitespace-normal break-words text-left bg-black text-white shadow-lg">
												Estimated barrels of oil equivalent per token based on reserves and token supply
											</div>
										{/if}
									</div>
									<div class="flex justify-between items-start relative overflow-visible">
										<span class="text-base font-medium text-black opacity-70 font-figtree flex items-center gap-1">
											Breakeven Oil Price
											<span class="inline-flex items-center justify-center w-3 h-3 rounded-full bg-gray-300 text-black text-[8px] font-bold cursor-help hover:bg-gray-400 transition-colors" on:mouseenter={() => showTooltipWithDelay('breakeven-' + token.contractAddress)} on:mouseleave={hideTooltip} on:focus={() => showTooltipWithDelay('breakeven-' + token.contractAddress)} on:blur={hideTooltip} role="button" tabindex="0">
												?
											</span>
										</span>
										<span class="text-base font-extrabold text-black text-right">{
											calculatedReturns?.breakEvenOilPrice !== undefined
												? `US$${calculatedReturns?.breakEvenOilPrice.toFixed(2)}`
												: 'US$0.00'
										}</span>
										{#if showTooltip === 'breakeven-' + token.contractAddress}
											<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 p-2 rounded-none text-xs z-[10000] mb-[6px] max-w-[260px] whitespace-normal break-words text-left bg-black text-white shadow-lg">
												Oil price required to cover operational costs and maintain profitability
											</div>
										{/if}
									</div>
									<div class="flex justify-between items-start">
										<span class="text-base font-medium text-black opacity-70 relative font-figtree">Royalty Accrual Start</span>
										<span class="text-base font-extrabold text-black text-right">{formatAccrualStartDate(token.firstPaymentDate || '')}</span>
									</div>
									<div class="flex justify-between items-start">
										<span class="text-base font-medium text-black opacity-70 relative font-figtree">Est. First Payout</span>
										<span class="text-base font-extrabold text-black text-right">{formatEstFirstPayout(token.firstPaymentDate || '')}</span>
									</div>
								</div>

								<div class="p-8 pt-0 border-t border-light-gray overflow-visible">
									{#if token}
										{@const defaultOilPrice = 65}
										{@const crudeBenchmark = token.asset?.technical?.crudeBenchmark || 'Oil'}
										{@const lifetimeIRR = calculateLifetimeIRR(token, defaultOilPrice, supply?.mintedSupply ?? 0, 1)}
										{@const monthlyCashflows = calculateMonthlyTokenCashflows(token, defaultOilPrice, supply?.mintedSupply ?? 0, 1)}
										{@const cashflows = monthlyCashflows.map(m => m.cashflow)}
										{@const monthlyIRR = calculateIRR(cashflows)}
										{@const remainingIRR = monthlyIRR > -0.99 ? (Math.pow(1 + monthlyIRR, 12) - 1) * 100 : -99}
										{@const fullyDilutedCashflows = calculateMonthlyTokenCashflows(token, defaultOilPrice, supply?.mintedSupply ?? 0, supply?.availableSupply ?? 0)}
										{@const fullyDilutedCashflowsArray = fullyDilutedCashflows.map(m => m.cashflow)}
										{@const fullyDilutedMonthlyIRR = calculateIRR(fullyDilutedCashflowsArray)}
										{@const fullyDilutedRemainingIRR = fullyDilutedMonthlyIRR > -0.99 ? (Math.pow(1 + fullyDilutedMonthlyIRR, 12) - 1) * 100 : -99}

										<h5 class="text-sm font-extrabold text-black uppercase tracking-wider mb-4 pt-6">
											Returns @${defaultOilPrice} {crudeBenchmark} Oil Price
										</h5>
										<div class="grid grid-cols-3 gap-2 sm:gap-3 mb-3 overflow-visible">
											<div class="text-center p-3 bg-white">
												<span class="text-xs font-medium text-black opacity-70 block mb-1">Current</span>
												<span class="text-xl font-extrabold text-primary">{formatSmartReturn(remainingIRR)}</span>
											</div>
											<div class="text-center p-3 bg-white">
												<span class="text-xs font-medium text-black opacity-70 block mb-1">Fully Diluted</span>
												<span class="text-xl font-extrabold text-primary">{formatSmartReturn(fullyDilutedRemainingIRR)}</span>
											</div>
											<div class="text-center p-3 bg-white border-l border-light-gray relative overflow-visible" style="border-left-width: 1.5px;">
												<div class="flex items-center justify-center gap-1 mb-1">
													<span class="text-xs font-medium text-black opacity-70">Lifetime</span>
													<span
														class="inline-flex items-center justify-center w-3 h-3 rounded-full bg-gray-300 text-black text-[8px] font-bold cursor-help hover:bg-gray-400 transition-colors"
														on:mouseenter={() => showTooltipWithDelay('lifetime-tooltip-' + token.contractAddress)}
														on:mouseleave={hideTooltip}
														on:focus={() => showTooltipWithDelay('lifetime-tooltip-' + token.contractAddress)}
														on:blur={hideTooltip}
														role="button"
														tabindex="0"
													>
														?
													</span>
													{#if showTooltip === 'lifetime-tooltip-' + token.contractAddress}
														<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded-none text-xs whitespace-nowrap z-[1000] mb-[5px]">
															Return from holding token since launch, assuming current supply
														</div>
													{/if}
												</div>
												<span class="text-xl font-extrabold text-primary">{formatSmartReturn(lifetimeIRR)}</span>
											</div>
										</div>
										<p class="text-xs text-gray-600 mb-2 italic">
											Returns value early principal repayments by assuming re-investment in similar assets
										</p>
										<button
											class="text-base font-semibold text-secondary hover:text-primary transition-colors cursor-pointer bg-transparent border-none p-0 text-left w-full"
											on:click={() => openReturnsEstimator(token, supply?.mintedSupply ?? 0, supply?.availableSupply ?? 0)}
										>
											View returns estimator →
										</button>
									{/if}
								</div>

								<div class="px-4 sm:px-8 pb-6 sm:pb-8">
									<div class="grid grid-cols-2 gap-2 sm:gap-3">
										{#if hasAvailableSupply}
											<PrimaryButton
												fullWidth
												size="small"
												on:click={(event) => handleBuyTokens(token.contractAddress, event)}
											>
												<span class="hidden sm:inline">Buy Tokens</span>
												<span class="sm:hidden">Buy</span>
											</PrimaryButton>
										{:else}
											<PrimaryButton fullWidth size="small" disabled>
												<span class="hidden sm:inline">Sold Out</span><span class="sm:hidden">Sold Out</span>
											</PrimaryButton>
										{/if}
										<SecondaryButton
											fullWidth
											size="small"
											on:click={(event) => handleHistoryButtonClick(token.contractAddress, event)}
										>
											<span class="hidden sm:inline">Distributions</span>
											<span class="sm:hidden">History</span>
										</SecondaryButton>
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
					title="Distributions History"
					size="large"
					on:close={closeHistoryModal}
				>
					{#if selectedHistoryToken}
						<div class="mb-6">
							<h4 class="text-lg font-extrabold text-black uppercase tracking-wider mb-1">{selectedHistoryToken.releaseName}</h4>
							<a
								href={getAddressUrl(selectedHistoryToken.contractAddress, $chainId)}
								target="_blank"
								rel="noopener noreferrer"
								class="text-xs text-black opacity-70 break-all no-underline hover:text-primary hover:opacity-100 transition-all inline-block"
							>
								{selectedHistoryToken.contractAddress}
							</a>
						</div>

						{#if historyPayouts.length > 0}
								<div class="space-y-4">
									<div class="grid grid-cols-[1.2fr,1fr,1.6fr,1.6fr] gap-6 text-xs font-bold text-black uppercase tracking-wider border-b border-light-gray pb-2">
										<div class="text-left">Month</div>
										<div class="text-center">Total Payments</div>
										<div class="text-left">Claims Vault</div>
										<div class="text-left">Payout Transaction</div>
									</div>
										<div class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
											{#each historyPayouts as payout (payout.orderHash ?? payout.txHash ?? payout.month)}
												<div class="grid grid-cols-[1.2fr,1fr,1.6fr,1.6fr] gap-6 text-sm items-center">
												<div class="text-left font-medium text-black">{formatReportMonth(payout.month)}</div>
												<div class="text-center font-semibold text-black">{formatCurrency(payout.totalPayout)}</div>
												<div class="text-left font-semibold text-secondary">
													{#if payout.orderHash}
														<a
															href={`https://raindex.finance/orders/8453-${payout.orderHash}`}
															target="_blank"
															rel="noopener noreferrer"
															class="inline-flex items-center gap-1 no-underline hover:text-primary break-all"
														>
															<span>{formatHash(payout.orderHash)}</span>
															<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
																<path stroke-linecap="round" stroke-linejoin="round" d="M10 6h8m0 0v8m0-8L9 15" />
															</svg>
														</a>
													{:else}
														<span class="text-black opacity-50">—</span>
													{/if}
												</div>
												<div class="text-left font-semibold text-secondary">
													{#if payout.txHash}
														<a
															href={getTxUrl(payout.txHash, $chainId)}
															target="_blank"
															rel="noopener noreferrer"
															class="inline-flex items-center gap-1 no-underline hover:text-primary break-all"
														>
															<span>{formatHash(payout.txHash)}</span>
															<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
																<path stroke-linecap="round" stroke-linejoin="round" d="M10 6h8m0 0v8m0-8L9 15" />
															</svg>
														</a>
													{:else}
														<span class="text-black opacity-50">—</span>
													{/if}
												</div>
											</div>
										{/each}
									</div>
										<div class="border-t border-light-gray pt-4 grid grid-cols-[1.2fr,1fr,1.6fr,1.6fr] gap-6 text-sm font-extrabold items-center">
										<div class="text-left text-black">Total</div>
										<div class="text-center text-black">{formatCurrency(historyPayouts.reduce((sum, p) => sum + p.totalPayout, 0))}</div>
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

			<!-- Returns Estimator Modal -->
			<ReturnsEstimatorModal
				isOpen={returnsEstimatorOpen}
				token={selectedReturnsToken}
				mintedSupply={selectedReturnsTokenMintedSupply}
				availableSupply={selectedReturnsTokenAvailableSupply}
				onClose={closeReturnsEstimator}
			/>

					<!-- Future Releases Card -->
						{#if hasFutureReleases}
							<Card hoverable={false}>
							<CardContent paddingClass="p-0">
								<div class="future-release-card">
									<div class="relative preserve-3d transform-gpu transition-transform duration-500 {futureCardFlipped ? 'rotate-y-180' : ''} min-h-[650px]">
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

										<div class="text-left max-w-md w-full mx-auto flex-1 future-notify">
											<div id="mlb2-30848422" class="ml-form-embedContainer ml-subscribe-form ml-subscribe-form-30848422">
												<div class="ml-form-align-center">
													<div class="ml-form-embedWrapper embedForm">
														<div class="ml-form-embedBody ml-form-embedBodyDefault row-form">
															{#if futureSignupStatus === 'success'}
																<div class="py-4">
																	<p class="text-black font-semibold">Thank you for subscribing.</p>
																</div>
															{:else}
																<form
																	class="ml-block-form"
																	action="https://assets.mailerlite.com/jsonp/1795576/forms/165461032541620178/subscribe"
																	method="post"
																	on:submit={handleFutureSignupSubmit}
																>
																	<div class="ml-form-formContent">
																		<div class="ml-form-fieldRow ml-last-item">
																			<div class="ml-field-group ml-field-email ml-validate-email ml-validate-required">
																				<input
																					aria-label="email"
																					aria-required="true"
																					type="email"
																					name="fields[email]"
																					placeholder="Enter your email address"
																					autocomplete="email"
																					class="form-control w-full px-4 py-3 border border-light-gray bg-white text-black placeholder-black placeholder-opacity-50 focus:outline-none focus:border-primary"
																					required
																				>
																			</div>
																		</div>
																	</div>
																	<div class="ml-form-embedPermissions">
																		<div class="ml-form-embedPermissionsContent default privacy-policy">
																			<p class="text-base sm:text-lg text-black opacity-70 mb-6 leading-relaxed">Read our privacy policy</p>
																		</div>
																	</div>
																	<div class="ml-form-recaptcha ml-validate-required mb-3">
																		<script src="https://www.google.com/recaptcha/api.js"></script>
																		<div class="g-recaptcha" data-sitekey="6Lf1KHQUAAAAAFNKEX1hdSWCS3mRMv4FlFaNslaD"></div>
																	</div>
																	<input type="hidden" name="fields[interest]" value={assetId}>
																	<input type="hidden" name="ml-submit" value="1">
																	<div class="ml-form-embedSubmit">
																		<button
																			type="submit"
																			class="w-full px-6 py-3 bg-black text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer transition-colors duration-200 hover:bg-secondary border-0 disabled:opacity-60 disabled:cursor-not-allowed"
																			disabled={futureSignupSubmitting}
																		>
																			{futureSignupSubmitting ? 'Submitting…' : 'Subscribe'}
																		</button>
																	</div>
																	<input type="hidden" name="anticsrf" value="true">
																</form>
															{/if}
														</div>
														{#if futureSignupStatus === 'error'}
															<div class="py-2">
																<p class="text-sm text-red-600">Something went wrong. Please try again.</p>
															</div>
														{/if}
												</div>
											</div>
										</div>
										<div class="mt-3">
											<a
												href="/legal?tab=privacy"
												target="_blank"
												rel="noopener noreferrer"
												class="text-sm text-black opacity-70 underline hover:text-primary"
											>
												See our Privacy Policy
											</a>
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

        

		{#if locationModalOpen && locationModalCoordinates}
			<Modal
				bind:isOpen={locationModalOpen}
				title={`${locationModalAssetName || 'Asset'} Location`}
				size="large"
				maxHeight="90vh"
				on:close={closeLocationModal}
			>
				<div class="space-y-4">
					<div class="relative w-full pb-[56.25%] overflow-hidden rounded-none border border-light-gray bg-black/5">
						{#if locationModalMapUrl}
							<iframe
								src={locationModalMapUrl}
								loading="lazy"
								title={`${locationModalAssetName || 'Asset'} map view`}
								referrerpolicy="no-referrer-when-downgrade"
								allowfullscreen
								class="absolute inset-0 w-full h-full border-0"
							></iframe>
						{/if}
					</div>
					<div class="text-sm text-black opacity-80 text-center space-y-1">
						<p>{locationModalSubtitle || 'No additional location details available.'}</p>
						<p class="font-semibold">Coordinates: {locationModalCoordinates.lat}°, {locationModalCoordinates.lng}°</p>
						<a
							href={`https://maps.google.com/?q=${encodeURIComponent(`${locationModalCoordinates.lat},${locationModalCoordinates.lng}`)}`}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1 text-secondary underline hover:text-primary"
						>
							Open in Google Maps
						</a>
					</div>
				</div>
			</Modal>
		{/if}

		{#if galleryModalOpen && selectedGalleryImage}
			<Modal
				bind:isOpen={galleryModalOpen}
				title={selectedGalleryImage.caption || selectedGalleryImage.title || 'Asset image'}
				size="large"
				maxHeight="90vh"
				on:close={closeGalleryModal}
			>
				<div class="flex flex-col gap-4 items-center">
					<img
						src={getImageUrl(selectedGalleryImage.url)}
						alt={selectedGalleryImage.caption || selectedGalleryImage.title || 'Asset image'}
						class="w-full max-h-[70vh] object-contain rounded-none border border-light-gray bg-black/5"
					/>
					{#if selectedGalleryImage.caption || selectedGalleryImage.title}
						<p class="text-sm text-black opacity-80 text-center">{selectedGalleryImage.caption || selectedGalleryImage.title}</p>
					{/if}
				</div>
			</Modal>
		{/if}

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
