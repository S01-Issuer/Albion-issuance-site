<script lang="ts">
	import { useClaimsService, useCatalogService } from '$lib/services';
	import { claimsCache } from '$lib/stores/claimsCache';
	import { web3Modal, signerAddress, connected } from 'svelte-wagmi';
	import { 
		Card, 
		CardContent, 
		PrimaryButton, 
		SecondaryButton, 
		StatsCard, 
		SectionTitle,
		TabButton,
		Chart,
		BarChart,
		PieChart,
		StatusBadge,
		ActionCard,
		Modal
	} from '$lib/components/components';
	import { PageLayout, HeroSection, ContentSection, FullWidthSection } from '$lib/components/layout';
	import { formatCurrency, formatPercentage, formatNumber } from '$lib/utils/formatters';
	import { sftRepository } from '$lib/data/repositories/sftRepository';
	import { sfts, sftMetadata } from '$lib/stores';
	import { formatEther } from 'viem';
	import { goto } from '$app/navigation';
	import { useTooltip } from '$lib/composables';
	import { getImageUrl } from '$lib/utils/imagePath';
	import { decodeSftInformation } from '$lib/decodeMetadata/helpers';
import type { ClaimsResult, ClaimsHoldingsGroup } from '$lib/services/ClaimsService';
import type { ClaimHistory as ClaimsHistoryItem } from '$lib/utils/claims';
import type { PinnedMetadata } from '$lib/types/PinnedMetadata';
import type { DepositWithReceipt } from '$lib/types/graphql';

const isDev = import.meta.env.DEV;
const logDev = (...messages: unknown[]) => {
	if (isDev) console.warn('[Portfolio]', ...messages);
};

type PortfolioTab = 'overview' | 'performance' | 'allocation';

interface ClaimGroupSummary {
	fieldName: string;
	tokenAddress: string;
	unclaimedAmount: number;
	claimedAmount: number;
	totalEarned: number;
	holdings: ClaimsHoldingsGroup['holdings'];
}

interface MonthlyPayout {
	month: string;
	amount: number;
	assetName: string;
	tokenSymbol: string;
	date: string;
	txHash: string;
	payoutPerToken: number;
}

interface TokenAllocationEntry {
	assetId: string;
	assetName: string;
	tokenSymbol: string;
	tokensOwned: number;
	currentValue: number;
	percentageOfPortfolio: number;
}

type HistoryPoint = { date: string; value: number };
type CumulativeHistoryPoint = { label: string; value: number };
type CapitalWalkPoint = {
	date: string;
	cumulativeMints: number;
	cumulativePayouts: number;
	netPosition: number;
	monthlyMint: number;
	monthlyPayout: number;
};

interface CapitalWalkSummary {
	chartData: CapitalWalkPoint[];
	peakNegativePosition: number;
	houseMoneyCrossDate: string | null;
	grossDeployed: number;
	grossPayout: number;
	currentNetPosition: number;
}

interface PortfolioHolding {
	id: string;
	name: string;
	location: string;
	totalMinted: number; // Sum of deposits (mints)
	totalInvested: number; // totalMinted + secondary purchases
	totalPayoutsEarned: number;
	unclaimedAmount: number;
	claimedAmount: number;
	lastPayoutAmount: number;
	lastPayoutDate: string | null;
	status: string;
	tokensOwned: number;
	tokenSymbol: string;
	capitalReturned: number;
	unrecoveredCapital: number;
	assetDepletion: number | null;
	asset?: PinnedMetadata['asset']; // Token's embedded asset data (for returns estimation)
	sharedAsset?: import('$lib/types/uiTypes').Asset; // Shared Asset object (for display)
	sftAddress: string;
	claimHistory: ClaimsHistoryItem[];
	pinnedMetadata: PinnedMetadata;
}

// Tab state
let activeTab: PortfolioTab = 'overview';
	
	// Page state
	let pageLoading = true;
	let isLoadingData = false;
	let loadingForAddress: string | null = null;
	let totalInvested = 0;
	let totalPayoutsEarned = 0;
	let unclaimedPayout = 0;
	let activeAssetsCount = 0;
	let holdings: PortfolioHolding[] = [];
	let claimHistory: ClaimsHistoryItem[] = [];
	let monthlyPayouts: MonthlyPayout[] = [];
	let tokenAllocations: TokenAllocationEntry[] = [];
let claimsHoldings: ClaimGroupSummary[] = [];
let hasPortfolioHistory = false;
let catalogRef: ReturnType<typeof useCatalogService> | null = null;
let latestClaimsSnapshot: ClaimsResult | null = null;
let claimsDataUnavailable = false;
let allDepositsData: DepositWithReceipt[] = [];

// Secondary purchase entry type
interface SecondaryPurchaseEntry {
	month: string;
	quantity: number;
	amount: number;
}

// Secondary purchases stored in localStorage (user-editable)
let secondaryPurchases: Record<string, SecondaryPurchaseEntry[]> = {};

// Edit modal state
let editModalOpen = false;
let editModalHolding: PortfolioHolding | null = null;
let editModalPurchases: SecondaryPurchaseEntry[] = [];

// Load secondary purchases from localStorage
function loadSecondaryPurchases(): Record<string, SecondaryPurchaseEntry[]> {
	if (typeof window === 'undefined') return {};
	try {
		const stored = localStorage.getItem('albion-secondary-purchases-v2');
		return stored ? JSON.parse(stored) : {};
	} catch {
		return {};
	}
}

// Save secondary purchases to localStorage
function saveSecondaryPurchases(data: Record<string, SecondaryPurchaseEntry[]>) {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem('albion-secondary-purchases-v2', JSON.stringify(data));
	} catch {
		console.error('Failed to save secondary purchases to localStorage');
	}
}

// Get total secondary amount for a token
function getSecondaryTotal(tokenAddress: string): number {
	const purchases = secondaryPurchases[tokenAddress.toLowerCase()];
	if (!Array.isArray(purchases)) return 0;
	return purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
}

function openEditModal(holding: PortfolioHolding) {
	editModalHolding = holding;
	const existing = secondaryPurchases[holding.sftAddress.toLowerCase()];
	editModalPurchases = Array.isArray(existing) && existing.length > 0
		? [...existing]
		: [{ month: '', quantity: 0, amount: 0 }];
	editModalOpen = true;
}

function closeEditModal() {
	editModalOpen = false;
	editModalHolding = null;
	editModalPurchases = [];
}

function addPurchaseRow() {
	editModalPurchases = [...editModalPurchases, { month: '', quantity: 0, amount: 0 }];
}

function removePurchaseRow(index: number) {
	editModalPurchases = editModalPurchases.filter((_, i) => i !== index);
	if (editModalPurchases.length === 0) {
		editModalPurchases = [{ month: '', quantity: 0, amount: 0 }];
	}
}

function saveEditModal() {
	if (!editModalHolding) return;
	const address = editModalHolding.sftAddress.toLowerCase();

	// Filter out empty entries
	const validPurchases = editModalPurchases.filter(p => p.month && p.amount > 0);
	secondaryPurchases[address] = validPurchases;
	saveSecondaryPurchases(secondaryPurchases);

	// Calculate total secondary amount
	const secondaryTotal = validPurchases.reduce((sum, p) => sum + p.amount, 0);

	// Update the holding's totalInvested and recalculate derived values
	const holdingIndex = holdings.findIndex(h => h.id === editModalHolding?.id);
	if (holdingIndex !== -1) {
		const holding = holdings[holdingIndex];
		const minted = holding.totalMinted;
		const newTotalInvested = minted + secondaryTotal;

		holding.totalInvested = newTotalInvested;
		holding.capitalReturned = newTotalInvested > 0
			? (holding.totalPayoutsEarned / newTotalInvested) * 100
			: 0;
		holding.unrecoveredCapital = Math.max(0, newTotalInvested - holding.totalPayoutsEarned);

		holdings = [...holdings]; // Trigger reactivity
	}

	// Recalculate total invested
	totalInvested = holdings.reduce((sum, h) => sum + h.totalInvested, 0);

	closeEditModal();
}
	
	// Composables
	const { show: showTooltipWithDelay, hide: hideTooltip, isVisible: isTooltipVisible } = useTooltip();

	let historyModalPayoutData: HistoryPoint[] = [];
	let historyModalCumulativeData: CumulativeHistoryPoint[] = [];
	let historyModalOpen = false;
	let historyModalHolding: PortfolioHolding | null = null;

$: historyModalPayoutData = historyModalHolding
	? getPayoutChartData(historyModalHolding)
	: [];
$: historyModalCumulativeData = historyModalPayoutData.reduce<CumulativeHistoryPoint[]>(
	(acc, datapoint, index) => {
		const prevTotal = index > 0 ? acc[index - 1].value : 0;
		acc.push({ label: datapoint.date, value: prevTotal + datapoint.value });
		return acc;
	},
	[],
);

$: hasPortfolioHistory = holdings.length > 0 || (Array.isArray(claimHistory) && claimHistory.length > 0);

	function openHistoryModal(holding: PortfolioHolding) {
		historyModalHolding = holding;
		historyModalOpen = true;
	}

	function closeHistoryModal() {
		historyModalOpen = false;
		historyModalHolding = null;
	}

	// Load data when wallet is connected
	$: if ($connected && $signerAddress) {
		if ($sfts && $sftMetadata) {
			loadSftData();
		}
	}

	function toNumeric(value: unknown): number {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === 'string' && value.trim().length > 0) {
			const sanitized = value.replace(/[^0-9+\-.]+/g, '');
			const parsed = Number(sanitized);
			return Number.isFinite(parsed) ? parsed : 0;
		}
		if (typeof value === 'bigint') {
			return Number(value);
		}
		return 0;
	}

function normalizeMonth(value: unknown): string {
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	if (!trimmed) return '';
	if (/^\d{4}-\d{2}$/.test(trimmed)) {
		return trimmed;
	}
	const match = trimmed.match(/^(\d{4})-(\d{2})/);
	return match ? `${match[1]}-${match[2]}` : '';
}

function currencyDisplay(value: number, options?: Parameters<typeof formatCurrency>[1]): string {
	return claimsDataUnavailable ? 'N/A' : formatCurrency(value, options);
}

function percentageDisplay(value: number): string {
	return claimsDataUnavailable ? 'N/A' : formatPercentage(value);
}

	function normalizeDate(value: unknown): string {
		if (value instanceof Date && !Number.isNaN(value.getTime())) {
			return value.toISOString();
		}
		if (typeof value === 'string' && value) {
			const parsed = Date.parse(value);
			if (!Number.isNaN(parsed)) {
				return new Date(parsed).toISOString();
			}
			const numeric = Number(value);
			if (!Number.isNaN(numeric)) {
				return normalizeDate(numeric);
			}
		}
		if (typeof value === 'number' && Number.isFinite(value)) {
			const milliseconds = value > 1e12 ? value : value * 1000;
			const date = new Date(milliseconds);
			if (!Number.isNaN(date.getTime())) {
				return date.toISOString();
			}
		}
		return '';
	}

	function toCsvValue(value: unknown): string {
		if (value === null || value === undefined) return '';
		const stringValue = String(value);
		if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
			return '"' + stringValue.replace(/"/g, '""') + '"';
		}
		return stringValue;
	}

	function downloadCsvFile(filename: string, content: string) {
		const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	}

	function exportPortfolioHistory() {
		const activeHoldings = holdings.filter(
			(holding) => Number.isFinite(holding.tokensOwned) && holding.tokensOwned > 0,
		);
		if (activeHoldings.length === 0) {
			alert('No token holdings available to export yet.');
			return;
		}

		const toCurrency = (value: unknown): string => {
			if (value === null || value === undefined) return '0.00';
			const numeric = Number(value);
			return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
		};

		const toTokens = (value: unknown): string => {
			if (value === null || value === undefined) return '0.000';
			const numeric = Number(value);
			return Number.isFinite(numeric) ? numeric.toFixed(3) : '0.000';
		};

		const toPercent = (value: unknown, allowBlank = false): string => {
			if (value === null || value === undefined) {
				return allowBlank ? '' : '0.00';
			}
			const numeric = Number(value);
			if (!Number.isFinite(numeric)) {
				return allowBlank ? '' : '0.00';
			}
			return numeric.toFixed(2);
		};

		const totalInvestedAcrossHoldings = activeHoldings.reduce((sum, holding) => {
			const value = Number(holding.totalInvested ?? 0);
			return sum + (Number.isFinite(value) ? value : 0);
		}, 0);

		const headers = [
			'asset',
			'token_symbol',
			'share_percentage',
			'tokens_owned',
			'allocation_percent',
			'status',
			'location',
			'total_invested_usdc',
			'total_earned_usdc',
			'claimed_usdc',
			'unclaimed_usdc',
			'capital_returned_percent',
			'unrecovered_capital_usdc',
			'last_payout_usdc',
			'last_payout_date',
			'asset_depletion_percent',
			'token_contract'
		];

		const rows: Array<Record<string, string>> = activeHoldings.map((holding) => {
			// sharePercentage is token-specific, so use token's embedded asset data
			const sharePercentage = typeof holding.pinnedMetadata.sharePercentage === 'number'
				? holding.pinnedMetadata.sharePercentage
				: typeof holding.asset?.sharePercentage === 'number'
				? holding.asset.sharePercentage
				: typeof holding.asset?.assetTerms?.sharePercentage === 'number'
				? holding.asset.assetTerms.sharePercentage
				: null;

			const allocationPercent = totalInvestedAcrossHoldings > 0
				? ((Number(holding.totalInvested) || 0) / totalInvestedAcrossHoldings) * 100
				: 0;

			// Use sharedAsset for display purposes
			const location = holding.sharedAsset?.location
				? [holding.sharedAsset.location.state, holding.sharedAsset.location.country]
						.filter(Boolean)
						.join(', ')
				: holding.location || '';

			return {
				asset: holding.sharedAsset?.name || holding.name || 'Unknown Asset',
				token_symbol: holding.tokenSymbol || '',
				share_percentage: toPercent(sharePercentage, true),
				tokens_owned: toTokens(holding.tokensOwned),
				allocation_percent: toPercent(allocationPercent),
				status: holding.status || '',
				location,
				total_invested_usdc: toCurrency(holding.totalInvested),
				total_earned_usdc: toCurrency(holding.totalPayoutsEarned),
				claimed_usdc: toCurrency(holding.claimedAmount),
				unclaimed_usdc: toCurrency(holding.unclaimedAmount),
				capital_returned_percent: toPercent(holding.capitalReturned),
				unrecovered_capital_usdc: toCurrency(holding.unrecoveredCapital),
				last_payout_usdc: toCurrency(holding.lastPayoutAmount),
				last_payout_date: holding.lastPayoutDate ? normalizeDate(holding.lastPayoutDate) : '',
				asset_depletion_percent: toPercent(holding.assetDepletion, true),
				token_contract: holding.sftAddress || ''
			};
		});

		rows.sort((a, b) => a.asset.localeCompare(b.asset));

		const csvLines = [headers.join(',')];
		for (const row of rows) {
			csvLines.push(
				headers
					.map((header) => {
						const value = row[header] ?? '';
						return toCsvValue(value);
					})
					.join(','),
			);
		}

		const filename = `albion-portfolio-holdings-${new Date().toISOString().split('T')[0]}.csv`;
		downloadCsvFile(filename, csvLines.join('\n'));
	}

	async function loadAllClaimsData(): Promise<ClaimsResult | null> {
		const claims = useClaimsService();
		const address = $signerAddress || '';
		claimsDataUnavailable = false;

		if (!address) {
			latestClaimsSnapshot = null;
			return null;
		}

		const cached = claimsCache.get(address);
		if (cached) {
			logDev('Using cached claims data');
			claimsDataUnavailable = !!cached.hasCsvLoadError;
			if (claimsDataUnavailable) {
				latestClaimsSnapshot = null;
				return null;
			}
			latestClaimsSnapshot = cached;
			return cached;
		}

		logDev('Loading fresh claims data');
		try {
			const result = await claims.loadClaimsForWallet(address);
			claimsDataUnavailable = !!result.hasCsvLoadError;
			if (!claimsDataUnavailable) {
				claimsCache.set(address, result);
				latestClaimsSnapshot = result;
				return result;
			}
			latestClaimsSnapshot = null;
			return null;
		} catch (error) {
			console.error('[Portfolio] Failed to load claims data:', error);
			claimsDataUnavailable = true;
			latestClaimsSnapshot = null;
			return null;
		}
	}

	async function loadSftData() {
		if (!$signerAddress) return;
		// Prevent duplicate loads for the same address
		if (isLoadingData && loadingForAddress === $signerAddress) return;
		isLoadingData = true;
		loadingForAddress = $signerAddress;
		pageLoading = true;

		// Reset all portfolio variables
		totalInvested = 0;
		totalPayoutsEarned = 0;
		unclaimedPayout = 0;
		activeAssetsCount = 0;
		monthlyPayouts = [];
		tokenAllocations = [];
		holdings = [];
		claimsHoldings = [];
		claimHistory = [];

		try {
			// Build catalog to populate stores
			const catalog = useCatalogService();
			await catalog.build();
			catalogRef = catalog;

			// Load all claims data using ClaimsService
			const claimsResult = await loadAllClaimsData();
			
			// Use the claims result
			if (claimsResult) {
				claimHistory = claimsResult.claimHistory;
				totalPayoutsEarned = claimsResult.totals.earned;
				unclaimedPayout = claimsResult.totals.unclaimed;

				// Map holdings to claimsHoldings format with derived totals
				claimsHoldings = claimsResult.holdings.map((group: ClaimsHoldingsGroup) => {
					// Filter claims by token address to ensure correct matching per token
					const normalizedTokenAddress = group.tokenAddress?.toLowerCase();
					const groupClaims = claimsResult.claimHistory.filter(
						(claim) => claim.tokenAddress?.toLowerCase() === normalizedTokenAddress,
					);
					const claimedAmount = groupClaims.reduce((sum, claim) => {
						const amount = Number(claim.amount ?? 0);
						const isCompleted = !claim.status || claim.status === 'completed';
						return sum + (isCompleted && Number.isFinite(amount) ? amount : 0);
					}, 0);
					const unclaimedAmountRaw = Number(group.totalAmount ?? 0);
					const unclaimedAmount = Number.isFinite(unclaimedAmountRaw)
						? unclaimedAmountRaw
						: 0;
					const totalEarned = claimedAmount + unclaimedAmount;
					return {
						fieldName: group.fieldName,
						tokenAddress: group.tokenAddress,
						unclaimedAmount,
						claimedAmount,
						totalEarned,
						holdings: group.holdings,
					};
				});
			}

			// Load secondary purchases from localStorage
			secondaryPurchases = loadSecondaryPurchases();

			// Get deposits data for calculating totalMinted
			allDepositsData = await sftRepository.getDepositsForOwner($signerAddress);

			if (!$sfts || !$sftMetadata || $sfts.length === 0 || $sftMetadata.length === 0) {
				pageLoading = false;
				isLoadingData = false;
				return;
			}

			// Decode metadata
			const decodedMeta = $sftMetadata
				.map((metaV1) => decodeSftInformation(metaV1))
				.filter((meta): meta is PinnedMetadata => Boolean(meta));

			// Build orderHash -> month lookup from metadata payoutData
			const orderHashToMonth: Record<string, string> = {};
			for (const meta of decodedMeta) {
				if (Array.isArray(meta.payoutData)) {
					for (const payout of meta.payoutData) {
						const orderHash = payout.tokenPayout?.orderHash;
						const month = payout.month;
						if (orderHash && month) {
							orderHashToMonth[orderHash.toLowerCase()] = month;
						}
					}
				}
			}

			// Update claim history dates using the orderHash -> month lookup
			if (claimHistory.length > 0 && Object.keys(orderHashToMonth).length > 0) {
				claimHistory = claimHistory.map((claim) => {
					if (claim.orderHash) {
						const month = orderHashToMonth[claim.orderHash.toLowerCase()];
						if (month) {
							// Convert month (YYYY-MM) to ISO date (first of month)
							return { ...claim, date: `${month}-01T00:00:00.000Z` };
						}
					}
					return claim;
				});
			}

			// Deduplicate SFTs by ID
			const uniqueSftsMap: Record<string, typeof $sfts[number]> = {};
			for (const sft of $sfts) {
				if (sft?.id) {
					uniqueSftsMap[sft.id.toLowerCase()] = sft;
				}
			}
			const uniqueSfts = Object.values(uniqueSftsMap);

			// Process each individual SFT token
			for (const sft of uniqueSfts) {
				// Find metadata for this SFT
				const pinnedMetadata = decodedMeta.find((meta) => {
					if (!meta.contractAddress) return false;
					const metaAddress = meta.contractAddress.toLowerCase();
					const sftAddress = sft.id.toLowerCase();
					if (metaAddress === sftAddress) {
						return true;
					}
					const targetAddress = `0x000000000000000000000000${sft.id
						.slice(2)
						.toLowerCase()}`;
					if (metaAddress === targetAddress) {
						return true;
					}
					const unpaddedMetaAddress = metaAddress.replace(/^0x0+/, '0x');
					return unpaddedMetaAddress === sftAddress;
				});
				
				if (pinnedMetadata) {
					const asset = pinnedMetadata.asset;
					if (!asset) {
						continue;
					}
					const assetFieldName = asset.assetName ?? '';
					if (!assetFieldName) {
						continue;
					}

					// Get token balance directly from tokenHolders (source of truth)
					let tokensOwned = 0;

					if (Array.isArray(sft.tokenHolders)) {
						const tokenHolder = sft.tokenHolders.find(
							(holder) =>
								holder.address?.toLowerCase() === $signerAddress.toLowerCase(),
						);
						if (tokenHolder) {
							tokensOwned = Number(
								formatEther(BigInt(tokenHolder.balance)),
							);
						}
					}
					
				let totalEarnedForSft = 0;
				let unclaimedAmountForSft = 0;
				let claimedAmountForSft = 0;

					// Find claims data for this specific SFT by matching the token address
					const normalizedSftAddress = sft.id.toLowerCase();
					const sftClaimsGroup = claimsHoldings.find(
						(group) => group.tokenAddress?.toLowerCase() === normalizedSftAddress,
					);

					// Use data from claimsGroup if available (this is the source of truth)
				if (sftClaimsGroup) {
					claimedAmountForSft = Number(sftClaimsGroup.claimedAmount ?? 0);
					unclaimedAmountForSft = Number(sftClaimsGroup.unclaimedAmount ?? 0);
					const groupTotal = Number(sftClaimsGroup.totalEarned ?? 0);
					totalEarnedForSft = groupTotal || claimedAmountForSft + unclaimedAmountForSft;
				}

					// Get claim history for this asset by matching token address
					const sftClaims = claimHistory.filter(
						(claim) => claim.tokenAddress?.toLowerCase() === normalizedSftAddress,
					);
					const totalEarnedFromHistory = sftClaims.reduce((sum, claim) => {
						const amount = Number(claim?.amount ?? 0);
						return sum + (Number.isFinite(amount) ? amount : 0);
					}, 0);
					const claimedFromHistory = sftClaims.reduce((sum, claim) => {
						const amount = Number(claim?.amount ?? 0);
						const isCompleted = !claim?.status || claim.status === 'completed';
						return sum + (isCompleted && Number.isFinite(amount) ? amount : 0);
					}, 0);
				if (!claimedAmountForSft && claimedFromHistory) {
					claimedAmountForSft = claimedFromHistory;
				}
				if (!totalEarnedForSft && totalEarnedFromHistory) {
					totalEarnedForSft = totalEarnedFromHistory;
				}
				if (!unclaimedAmountForSft) {
					const pending = totalEarnedForSft - claimedAmountForSft;
					unclaimedAmountForSft = pending > 0 ? pending : 0;
				}
				totalEarnedForSft = Math.max(totalEarnedForSft, claimedAmountForSft + unclaimedAmountForSft);
					const plannedProjections = Array.isArray(asset.plannedProduction?.projections)
						? asset.plannedProduction?.projections ?? []
						: [];
					const receiptsRecords = Array.isArray(asset.receiptsData)
						? asset.receiptsData ?? []
						: [];
					const payoutMonths = Array.isArray(pinnedMetadata.payoutData)
						? pinnedMetadata.payoutData
							.map((p) => normalizeMonth(p?.month))
							.filter((month: string) => month.length > 0)
						: [];
					let earliestObservedMonth = '';
					if (payoutMonths.length > 0) {
						earliestObservedMonth = payoutMonths.sort()[0];
					}
					if (!earliestObservedMonth) {
						const receiptMonths = receiptsRecords
							.map((entry) => normalizeMonth(entry?.month))
							.filter((month: string) => month.length > 0);
						if (receiptMonths.length > 0) {
							earliestObservedMonth = receiptMonths.sort()[0];
						}
					}
					const hasRelevantReceipts = receiptsRecords.some((entry) => {
						const month = normalizeMonth(entry?.month);
						return !earliestObservedMonth || (month && month >= earliestObservedMonth);
					});
					const receiptsProductionTotal = receiptsRecords.reduce((sum, entry) => {
						const month = normalizeMonth(entry?.month);
						if (!earliestObservedMonth || (month && month >= earliestObservedMonth)) {
							const value = entry?.assetData?.production ?? entry?.production;
							return sum + toNumeric(value ?? 0);
						}
						return sum;
					}, 0);
					const plannedFromStart = plannedProjections.reduce((sum, projection) => {
						const month = normalizeMonth(projection?.month);
						if (!earliestObservedMonth || (month && month >= earliestObservedMonth)) {
							return sum + toNumeric(projection?.production ?? 0);
						}
						return sum;
					}, 0);
					logDev('Depletion calc', {
						assetId: sft.id,
						assetName: assetFieldName,
						earliestObservedMonth,
						receiptsProductionTotal,
						plannedFromStart,
						receiptsCount: receiptsRecords.length,
						plannedCount: plannedProjections.length,
						hasRelevantReceipts,
					});
					let assetDepletionPercentage: number | null = null;

					if (plannedFromStart > 0) {
						const numeratorSource = hasRelevantReceipts ? receiptsProductionTotal : 0;
						const rawDepletion = Math.min((numeratorSource / plannedFromStart) * 100, 100);
						assetDepletionPercentage = rawDepletion;
						if (numeratorSource > 0 && rawDepletion > 0 && rawDepletion < 0.1) {
							assetDepletionPercentage = 0.1;
						}
					}
					
					// Only add to holdings if user actually owns tokens
					if (tokensOwned > 0) {
						// Calculate totalMinted from deposits only (not transfers/gifts)
						const sftDeposits = allDepositsData.filter(
							(deposit) =>
								deposit.offchainAssetReceiptVault?.id?.toLowerCase() ===
								sft.id.toLowerCase(),
						);
						let totalMinted = 0;
						for (const deposit of sftDeposits) {
							const amountRaw = deposit.amount ?? '0';
							const amountWei = typeof amountRaw === 'bigint' ? amountRaw : BigInt(amountRaw);
							totalMinted += Number(formatEther(amountWei));
						}
						// No fallback - if tokens were received via transfer/gift, totalMinted stays 0
						// User can add cost basis via Secondary Purchases if needed

						// Get secondary purchases from localStorage
						const secondaryAmount = getSecondaryTotal(sft.id);
						const totalInvestedInSft = totalMinted + secondaryAmount;

						const capitalReturned = totalInvestedInSft > 0
							? (totalEarnedForSft / totalInvestedInSft) * 100
							: 0;

						const unrecoveredCapital = Math.max(0, totalInvestedInSft - totalEarnedForSft);

						const lastClaim = sftClaims
							.filter((claim) => !claim.status || claim.status === 'completed')
							.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

						// Look up the shared Asset for display purposes
						const sharedAsset = catalogRef?.getAssetByTokenAddress(sft.id) ?? undefined;

						holdings.push({
							id: sft.id.toLowerCase(),
							name: assetFieldName || `SFT ${sft.id.slice(0, 8)}...`,
							location: sharedAsset?.location
								? `${sharedAsset.location.state || 'Unknown'}, ${sharedAsset.location.country || 'Unknown'}`
								: asset.location
									? `${asset.location.state || 'Unknown'}, ${asset.location.country || 'Unknown'}`
									: 'Unknown',
							totalMinted,
							totalInvested: totalInvestedInSft,
							totalPayoutsEarned: totalEarnedForSft,
							unclaimedAmount: unclaimedAmountForSft,
							claimedAmount: claimedAmountForSft,
							lastPayoutAmount: lastClaim ? Number(lastClaim.amount) : 0,
							lastPayoutDate: lastClaim ? lastClaim.date : null,
							status: sharedAsset?.status || asset.production?.status || 'producing',
							tokensOwned: tokensOwned,
							tokenSymbol: pinnedMetadata.symbol || sft.id.slice(0, 6).toUpperCase(),
							capitalReturned,
							unrecoveredCapital,
							assetDepletion: assetDepletionPercentage,
							asset,
							sharedAsset,
							sftAddress: sft.id,
							claimHistory: sftClaims,
							pinnedMetadata: pinnedMetadata
						});
					}
				}
			}

			// Populate monthlyPayouts from claim history
			monthlyPayouts = [];
			const monthlyPayoutTotals: Record<string, number> = {};

			// Process claim history to get monthly aggregations (all payouts - claimed + unclaimed)
			// This shows when payouts were made available, not when they were claimed
			for (const claim of claimHistory) {
				if (claim.date && claim.amount) {
					const date = new Date(claim.date);
					const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
					const amount = Number(claim.amount);
					monthlyPayoutTotals[monthKey] = (monthlyPayoutTotals[monthKey] ?? 0) + (Number.isFinite(amount) ? amount : 0);
				}
			}

			for (const [monthKey, amount] of Object.entries(monthlyPayoutTotals)) {
				monthlyPayouts.push({
					month: monthKey,
					amount: amount,
					assetName: 'Multiple Assets',
					tokenSymbol: 'MIXED',
					date: `${monthKey}-01`,
					txHash: 'Multiple',
					payoutPerToken: 0
				});
			}

			monthlyPayouts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

			// Populate tokenAllocations from holdings
			const totalPortfolioValue = holdings.reduce(
				(sum, holding) => sum + holding.totalInvested,
				0,
			);
			tokenAllocations = holdings.map((holding) => {
				const allocationPercentage =
					totalPortfolioValue > 0
						? (holding.totalInvested / totalPortfolioValue) * 100
						: 0;

				return {
					assetId: holding.id,
					assetName: holding.sharedAsset?.name || holding.name,
					tokenSymbol: holding.tokenSymbol,
					tokensOwned: holding.tokensOwned,
					currentValue: holding.totalInvested,
					percentageOfPortfolio: allocationPercentage,
				};
			});

			// Calculate portfolio stats from holdings (based on token balances)
			totalInvested = holdings.reduce((sum, holding) => sum + holding.totalInvested, 0);

			if (holdings.length > 0) {
				totalPayoutsEarned = holdings.reduce((sum, holding) => sum + holding.totalPayoutsEarned, 0);
				unclaimedPayout = holdings.reduce((sum, holding) => sum + holding.unclaimedAmount, 0);
			} else {
				totalPayoutsEarned = claimsResult?.totals.earned ?? 0;
				unclaimedPayout = claimsResult?.totals.unclaimed ?? 0;
			}

			activeAssetsCount = holdings.length;

		} catch (error) {
			console.error('[Portfolio] Error loading data:', error);
		} finally {
			pageLoading = false;
			isLoadingData = false;
			loadingForAddress = null;
		}
	}
	
	function getPayoutChartData(holding: PortfolioHolding): HistoryPoint[] {
		if (!holding.claimHistory || holding.claimHistory.length === 0) {
			return [];
		}
		
		return holding.claimHistory
			.filter((claim) => claim.date && claim.amount)
			.map((claim) => ({
				date: new Date(claim.date).toISOString().split('T')[0],
				value: Number(claim.amount)
			}))
			.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
	}

	async function connectWallet() {
		if ($web3Modal) $web3Modal.open();
	}
</script>

<svelte:head>
	<title>Portfolio - Albion</title>
	<meta name="description" content="Track your oil & gas investment portfolio performance" />
</svelte:head>

{#if (!$connected || !$signerAddress)}
	<PageLayout variant="constrained">
		<ContentSection background="white" padding="large" centered>
			<div class="text-center">
				<SectionTitle level="h1" size="page" center>Wallet Connection Required</SectionTitle>
				<p class="text-lg text-black opacity-80 mb-8 max-w-md mx-auto">
					Please connect your wallet to view your portfolio and track your investments.
				</p>
				<PrimaryButton on:click={connectWallet}>Connect Wallet</PrimaryButton>
			</div>
		</ContentSection>
	</PageLayout>
{:else}
	<PageLayout variant="constrained">
		<!-- Hero Section with Stats -->
		<HeroSection title="My Portfolio" subtitle="Track your investments and performance" showBorder={true}>
			{#if pageLoading}
				<div class="text-center mt-8">
					<div class="w-8 h-8 border-4 border-light-gray border-t-primary animate-spin mx-auto mb-4"></div>
					<p class="text-black opacity-70">Loading portfolio data...</p>
				</div>
			{:else}
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-8 text-center max-w-6xl mx-auto mt-6">
					<StatsCard title="Total Invested" value={formatCurrency(totalInvested, { compact: true })} subtitle="Capital Deployed" size="small" />
					<StatsCard title="Total Earned" value={claimsDataUnavailable ? 'N/A' : formatCurrency(totalPayoutsEarned, { compact: true })} subtitle="All Payouts" size="small" />
					<StatsCard title="Unclaimed" value={claimsDataUnavailable ? 'N/A' : formatCurrency(unclaimedPayout, { compact: true })} subtitle="Ready to Claim" size="small" />
					<StatsCard title="Active Assets" value={activeAssetsCount.toString()} subtitle="Assets Held" size="small" />
				</div>

				{#if claimsDataUnavailable}
					<div class="mt-6 max-w-3xl mx-auto px-4 py-3 border border-yellow-400 bg-yellow-50 text-yellow-900 text-sm font-medium rounded-none" role="alert" aria-live="polite">
						Some data could not be loaded. Please try again later.
					</div>
				{/if}
			{/if}
		</HeroSection>

		<!-- Tabs Navigation -->
		<div class="bg-white border-b border-light-gray">
			<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="flex gap-0 justify-between items-center">
					<div class="flex gap-0">
						<TabButton active={activeTab === 'overview'} on:click={() => activeTab = 'overview'}>
							Holdings
						</TabButton>
						<TabButton active={activeTab === 'performance'} on:click={() => activeTab = 'performance'}>
							Performance
						</TabButton>
						<TabButton active={activeTab === 'allocation'} on:click={() => activeTab = 'allocation'}>
							Allocation
						</TabButton>
					</div>
				</div>
			</div>
		</div>
		
		<!-- Tab Content -->
		<ContentSection background="white" padding="large">
			{#if activeTab === 'overview'}
				<SectionTitle level="h3" size="subsection" className="mb-6">My Holdings</SectionTitle>
				
				<div class="space-y-3">
					{#if pageLoading}
						<div class="text-center py-12 text-black opacity-70">Loading portfolio holdings...</div>
					{:else if holdings.length === 0}
							<Card hoverable={false}>
							<CardContent>
								<div class="text-center py-8">
									<p class="text-lg text-black opacity-70 mb-4">No holdings yet</p>
									<p class="text-sm text-black opacity-60 mb-6">
										Start building your portfolio by investing in royalty tokens
									</p>
									<PrimaryButton on:click={() => goto('/assets')}>
										Browse Assets
									</PrimaryButton>
								</div>
							</CardContent>
						</Card>
					{:else}
						{#each holdings as holding (holding.id)}
							{@const imageUrl = holding.sharedAsset?.coverImage
								? getImageUrl(holding.sharedAsset.coverImage)
								: holding.sharedAsset?.galleryImages?.[0]?.url
								? getImageUrl(holding.sharedAsset.galleryImages[0].url)
								: null}
								<div class="mb-3">
									<Card hoverable={false} showBorder>
									<CardContent paddingClass="p-6 lg:p-9 h-full flex flex-col justify-between">
												<div class="flex justify-between items-start mb-4 lg:mb-7">
													<div class="flex items-start gap-3 lg:gap-4">
														<div class="w-12 h-12 lg:w-14 lg:h-14 bg-light-gray rounded-none overflow-hidden flex items-center justify-center flex-shrink-0">
															{#if imageUrl}
																<img src={imageUrl}
																	alt={holding.name}
																	class="w-full h-full object-cover"
																					on:error={(e) => { const target = e.currentTarget as HTMLImageElement; target.style.display = 'none'; target.nextElementSibling?.classList.remove('hidden'); }} />
																<div class="text-xl lg:text-2xl opacity-50 hidden">🛢️</div>
															{:else}
																<div class="text-xl lg:text-2xl opacity-50">🛢️</div>
															{/if}
														</div>
														<div class="text-left">
															<h4 class="font-extrabold text-black text-base lg:text-lg mb-1">
																{holding.tokenSymbol}
															</h4>
															<div class="text-sm text-black opacity-70 mb-1">{holding.name}</div>
															{#if holding.sharedAsset?.location}
																<div class="text-xs text-black opacity-70 mb-2">
																	{holding.sharedAsset.location.state}, {holding.sharedAsset.location.country}
																</div>
															{/if}
															<StatusBadge 
																status={holding.status} 
																variant={holding.status === 'producing' ? 'available' : 'default'}
															/>
														</div>
													</div>

													<div class="flex gap-2">
														<SecondaryButton size="small" on:click={() => goto('/claims')}>
															Claims
														</SecondaryButton>
														<SecondaryButton size="small" on:click={() => openHistoryModal(holding)}>
															History
														</SecondaryButton>
													</div>
												</div>

												<div class="grid grid-cols-2 lg:grid-cols-6 gap-3 mt-4">
													<!-- Tokens -->
													<div class="flex flex-col">
														<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2 h-8">
															Tokens
														</div>
														<div class="text-lg lg:text-xl font-extrabold text-black">
															{formatNumber(holding.tokensOwned, { decimals: 3 })}
														</div>
													</div>

													<!-- Total Invested -->
													<div class="flex flex-col">
														<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2 h-8 flex items-start gap-1">
															<span>Total Invested</span>
															<button
																class="inline-flex items-center justify-center w-4 h-4 text-black opacity-50 hover:opacity-100 transition-opacity"
																on:click={() => openEditModal(holding)}
																aria-label="Edit total invested"
															>
																<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3">
																	<path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
																</svg>
															</button>
														</div>
														<div class="text-lg lg:text-xl font-extrabold text-black">
															{formatCurrency(holding.totalInvested)}
														</div>
														<div class="text-xs lg:text-sm text-black opacity-70">US$ Paid</div>
													</div>

													<!-- Payouts to Date -->
													<div class="flex flex-col">
														<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2 h-8">
															Payouts to Date
														</div>
														<div class="text-lg lg:text-xl font-extrabold text-primary">
															{currencyDisplay(holding.totalPayoutsEarned)}
														</div>
														<div class="text-xs lg:text-sm text-black opacity-70">Cumulative</div>
													</div>

													<!-- Capital Returned -->
													<div class="relative flex flex-col overflow-visible">
														<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2 flex items-start gap-1 h-8">
															<span>Capital Returned</span>
															<span class="inline-flex items-center justify-center w-3 h-3 rounded-full bg-gray-300 text-black text-[8px] font-bold cursor-help hover:bg-gray-400 transition-colors"
																on:mouseenter={() => showTooltipWithDelay('capital-' + holding.id)}
																on:mouseleave={hideTooltip}
																on:focus={() => showTooltipWithDelay('capital-' + holding.id)}
																on:blur={hideTooltip}
																role="button"
																tabindex="0">?</span>
														</div>
														<div class="text-lg lg:text-xl font-extrabold text-black">
															{holding.totalInvested > 0 ? percentageDisplay(holding.capitalReturned / 100) : 'N/A'}
														</div>
														<div class="text-xs lg:text-sm text-black opacity-70">To Date</div>
														{#if isTooltipVisible('capital-' + holding.id)}
															<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-3 rounded-none text-xs z-[1000] mb-2 w-48">
																The portion of your initial investment already recovered
															</div>
														{/if}
													</div>

													<!-- Asset Depletion -->
													<div class="relative flex flex-col hidden lg:flex overflow-visible">
														<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2 flex items-start gap-1 h-8">
															<span>Est. Asset Depletion</span>
															<span class="inline-flex items-center justify-center w-3 h-3 rounded-full bg-gray-300 text-black text-[8px] font-bold cursor-help hover:bg-gray-400 transition-colors"
																on:mouseenter={() => showTooltipWithDelay('depletion-' + holding.id)}
																on:mouseleave={hideTooltip}
																on:focus={() => showTooltipWithDelay('depletion-' + holding.id)}
																on:blur={hideTooltip}
																role="button"
																tabindex="0">?</span>
														</div>
									<div class="text-lg lg:text-xl font-extrabold text-black">
										{holding.assetDepletion !== null && holding.assetDepletion !== undefined ? `${holding.assetDepletion.toFixed(1)}%` : 'TBD'}
									</div>
														<div class="text-xs lg:text-sm text-black opacity-70">To Date</div>
														{#if isTooltipVisible('depletion-' + holding.id)}
															<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-3 rounded-none text-xs z-[1000] mb-2 w-48">
																The portion of total expected oil and gas extracted so far
															</div>
														{/if}
													</div>

													<!-- Capital To be Recovered / Lifetime Profit -->
													<div class="flex flex-col col-span-2 lg:col-span-1">
														<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2 h-8">
															{holding.unrecoveredCapital > 0 ? 'Capital To be Recovered' : 'Lifetime Profit'}
														</div>
														<div class="text-lg lg:text-xl font-extrabold {holding.unrecoveredCapital > 0 ? 'text-black' : 'text-primary'}">
															{currencyDisplay(holding.unrecoveredCapital > 0 ? holding.unrecoveredCapital : holding.totalPayoutsEarned - holding.totalInvested)}
														</div>
														<div class="text-xs lg:text-sm text-black opacity-70">
															{holding.unrecoveredCapital > 0 ? 'Remaining' : 'To Date'}
														</div>
													</div>
												</div>
								</CardContent>
								</Card>
							</div>
						{/each}

						{#if historyModalOpen && historyModalHolding}
							<Modal
								bind:isOpen={historyModalOpen}
								title={`${historyModalHolding.name} History`}
								size="large"
								maxHeight="90vh"
								on:close={closeHistoryModal}
							>
								<div class="space-y-6 px-4 sm:px-6 lg:px-8">
									<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
										<div>
											<h4 class="text-lg font-extrabold text-black">{historyModalHolding.tokenSymbol}</h4>
											<div class="text-sm text-black opacity-70">{historyModalHolding.name}</div>
											{#if historyModalHolding.sharedAsset?.location}
												<div class="text-xs text-black opacity-60 mt-1">
													{historyModalHolding.sharedAsset.location.state}, {historyModalHolding.sharedAsset.location.country}
												</div>
											{/if}
										</div>
										<div class="grid grid-cols-2 gap-4 sm:gap-6">
											<div>
												<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-1">Tokens</div>
												<div class="text-lg font-extrabold text-black">{formatNumber(historyModalHolding.tokensOwned, { decimals: 3 })}</div>
											</div>
											<div>
												<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-1">Total Invested</div>
												<div class="text-lg font-extrabold text-black">{formatCurrency(historyModalHolding.totalInvested)}</div>
											</div>
										</div>
									</div>

									{#if historyModalPayoutData.length > 0}
										<div class="space-y-6">
											<div>
												<h5 class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2">Monthly Payouts</h5>
											<div class="overflow-x-auto">
												<Chart
													data={historyModalPayoutData.map(d => ({ label: d.date, value: d.value }))}
													width={760}
													height={200}
													barColor="#08bccc"
													valuePrefix="$"
													animate={true}
													showGrid={true}
													yTickFormat={(value) => `$${Number(value).toFixed(1)}`}
												/>
												</div>
											</div>

											<div>
												<h5 class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2">Cumulative Returns</h5>
										<div class="overflow-x-auto">
											<Chart
													data={historyModalCumulativeData}
													width={760}
													height={200}
														barColor="#08bccc"
														valuePrefix="$"
														animate={true}
														showGrid={true}
														horizontalLine={{
															value: historyModalHolding.totalInvested,
															label: 'Breakeven',
															color: '#283c84'
														}}
													/>
												</div>
											</div>
										</div>
									{:else}
										<div class="py-12 text-center text-black opacity-70">
											<div class="text-3xl mb-2">📊</div>
											<div class="text-sm">No payout history available yet</div>
										</div>
									{/if}
								</div>
							</Modal>
						{/if}

						<!-- Edit Total Invested Modal -->
						{#if editModalOpen && editModalHolding}
							<Modal
								bind:isOpen={editModalOpen}
								title="Edit Total Invested"
								size="medium"
								on:close={closeEditModal}
							>
								<div class="space-y-6 px-4 sm:px-6">
									<div>
										<h4 class="text-lg font-extrabold text-black mb-1">{editModalHolding.tokenSymbol}</h4>
										<div class="text-sm text-black opacity-70">{editModalHolding.name}</div>
									</div>

									<div class="space-y-4">
										<!-- Total Minted (read-only) -->
										<div>
											<div class="block text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2">
												Total Minted (Deposited)
											</div>
											<div class="w-full px-4 py-3 border border-light-gray bg-gray-50 text-black font-medium">
												{formatCurrency(editModalHolding.totalMinted)}
											</div>
											<div class="text-xs text-black opacity-50 mt-1">From on-chain deposits</div>
										</div>

										<!-- Secondary Purchases (editable rows) -->
										<div>
											<div class="block text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2">
												Secondary Purchases
											</div>
											<div class="text-xs text-black opacity-50 mb-3">Update for more accurate returns data</div>

											<!-- Header row -->
											<div class="grid grid-cols-12 gap-2 mb-2 text-xs font-bold text-black opacity-70 uppercase">
												<div class="col-span-4">Month</div>
												<div class="col-span-3">Quantity</div>
												<div class="col-span-4">Amount ($)</div>
												<div class="col-span-1"></div>
											</div>

											<!-- Purchase rows -->
											{#each editModalPurchases as purchase, index (index)}
												<div class="grid grid-cols-12 gap-2 mb-2">
													<div class="col-span-4">
														<input
															type="month"
															bind:value={purchase.month}
															class="w-full px-2 py-2 border border-light-gray focus:border-primary focus:outline-none text-black text-sm"
														/>
													</div>
													<div class="col-span-3">
														<input
															type="number"
															min="0"
															step="0.001"
															bind:value={purchase.quantity}
															class="w-full px-2 py-2 border border-light-gray focus:border-primary focus:outline-none text-black text-sm"
															placeholder="0"
														/>
													</div>
													<div class="col-span-4">
														<input
															type="number"
															min="0"
															step="0.01"
															bind:value={purchase.amount}
															class="w-full px-2 py-2 border border-light-gray focus:border-primary focus:outline-none text-black text-sm"
															placeholder="0.00"
														/>
													</div>
													<div class="col-span-1 flex items-center justify-center">
														<button
															type="button"
															on:click={() => removePurchaseRow(index)}
															class="text-red-500 hover:text-red-700 text-lg font-bold"
															aria-label="Remove row"
														>
															×
														</button>
													</div>
												</div>
											{/each}

											<!-- Add row button -->
											<button
												type="button"
												on:click={addPurchaseRow}
												class="text-sm text-primary hover:underline mt-2"
											>
												+ Add another purchase
											</button>
										</div>

										<!-- Total -->
										<div class="pt-4 border-t border-light-gray">
											<div class="flex justify-between items-center">
												<span class="text-sm font-bold text-black opacity-70 uppercase tracking-wider">Total Invested</span>
												<span class="text-xl font-extrabold text-black">
													{formatCurrency(editModalHolding.totalMinted + editModalPurchases.reduce((sum, p) => sum + (p.amount || 0), 0))}
												</span>
											</div>
										</div>
									</div>

									<div class="flex gap-3 pt-4">
										<SecondaryButton fullWidth on:click={closeEditModal}>
											Cancel
										</SecondaryButton>
										<PrimaryButton fullWidth on:click={saveEditModal}>
											Save
										</PrimaryButton>
									</div>
								</div>
							</Modal>
						{/if}
					{/if}
				</div>

			{:else if activeTab === 'performance'}
				{@const capitalWalkData = (() => {
					// Aggregate mints (deposits) and payouts by month
					const monthlyMints: Record<string, number> = {};
					const monthlyPayoutsTotals: Record<string, number> = {};
					let houseMoneyCrossDate: string | null = null;

					// Process payouts from metadata payoutData (source of truth for when payouts were distributed)
					// Apply 2-month offset: e.g., August payout is received in October
					const addMonths = (monthStr: string, offset: number): string => {
						const [year, month] = monthStr.split('-').map(Number);
						const date = new Date(year, month - 1 + offset, 1);
						return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
					};

					for (const holding of holdings) {
						const payoutData = holding.pinnedMetadata?.payoutData;
						if (Array.isArray(payoutData) && holding.tokensOwned > 0) {
							for (const payout of payoutData) {
								const month = payout.month;
								const payoutPerToken = payout.tokenPayout?.payoutPerToken ?? 0;
								if (month && payoutPerToken > 0) {
									const receivedMonth = addMonths(month, 2); // 2-month offset
									const userPayout = payoutPerToken * holding.tokensOwned;
									monthlyPayoutsTotals[receivedMonth] = (monthlyPayoutsTotals[receivedMonth] ?? 0) + userPayout;
								}
							}
						}
					}

					// Process actual deposits with timestamps
					for (const deposit of allDepositsData) {
						const timestamp = deposit.transaction?.timestamp;
						if (timestamp) {
							const date = new Date(Number(timestamp) * 1000); // Unix timestamp to JS Date
							const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
							const amount = Number(formatEther(BigInt(deposit.amount)));
							monthlyMints[monthKey] = (monthlyMints[monthKey] ?? 0) + amount;
						}
					}

					// Add secondary purchases from localStorage (by their month)
					for (const [_tokenAddress, purchases] of Object.entries(secondaryPurchases)) {
						if (Array.isArray(purchases)) {
							for (const purchase of purchases) {
								if (purchase.month && purchase.amount > 0) {
									monthlyMints[purchase.month] = (monthlyMints[purchase.month] ?? 0) + purchase.amount;
								}
							}
						}
					}
					
					// Create chart data from all months
					const allMonthsMap: Record<string, true> = {};
					Object.keys(monthlyMints).forEach((month) => {
						allMonthsMap[month] = true;
					});
					Object.keys(monthlyPayoutsTotals).forEach((month) => {
						allMonthsMap[month] = true;
					});
					const sortedMonths = Object.keys(allMonthsMap).sort();
					const dataArray: CapitalWalkPoint[] = [];
					
					let runningCumulativeMints = 0;
					let runningCumulativePayouts = 0;
					let peakNegativePosition = 0; // Track the most negative net position

					sortedMonths.forEach(monthKey => {
						const monthlyMint = monthlyMints[monthKey] ?? 0;
						const monthlyPayout = monthlyPayoutsTotals[monthKey] ?? 0;

						runningCumulativeMints += monthlyMint;
						runningCumulativePayouts += monthlyPayout;

						const netPosition = runningCumulativePayouts - runningCumulativeMints;

						// Track the most negative position reached
						peakNegativePosition = Math.min(peakNegativePosition, netPosition);

						if (netPosition >= 0 && !houseMoneyCrossDate && runningCumulativeMints > 0) {
							houseMoneyCrossDate = `${monthKey}-01`;
						}
						
						dataArray.push({
							date: `${monthKey}-01`,
							cumulativeMints: runningCumulativeMints,
							cumulativePayouts: runningCumulativePayouts,
							netPosition,
							monthlyMint,
							monthlyPayout
						});
					});
					
					// Calculate real metrics from holdings
				const grossDeployed = holdings.reduce(
					(sum, holding) => sum + holding.totalInvested,
					0,
				);
				
				const earnedSnapshot = latestClaimsSnapshot?.totals.earned ?? 0;
				const grossPayout = earnedSnapshot > 0
					? earnedSnapshot
					: (totalPayoutsEarned > 0
						? totalPayoutsEarned
						: claimHistory.reduce((sum, claim) => sum + Number(claim.amount), 0));
				const currentNetPosition = grossPayout - grossDeployed;

				return {
					chartData: dataArray,
					peakNegativePosition,
					houseMoneyCrossDate,
					grossDeployed,
					grossPayout,
					currentNetPosition,
				} as CapitalWalkSummary;
				})()}
				
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
					<!-- Capital Walk Chart -->
					<div class="lg:col-span-2 bg-white border border-light-gray rounded-none p-6">
						<h4 class="text-lg font-extrabold text-black mb-4">Cash Flow Analysis</h4>
						<div class="space-y-6">
							<!-- Combined Monthly Cash Flows -->
							<div>
								<h5 class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-3">Monthly Cash Flows</h5>
								{#if capitalWalkData.chartData.length > 0}
									<BarChart
										data={capitalWalkData.chartData.map(d => ({
											label: d.date,
											value: -d.monthlyMint
										}))}
										data2={capitalWalkData.chartData.map(d => ({
											label: d.date,
											value: d.monthlyPayout
										}))}
										width={640}
										height={300}
										barColor="#283c84"
										barColor2="#08bccc"
										valuePrefix="$"
										showGrid={true}
										series1Name="Mints"
										series2Name="Payouts"
										showSmallValueLabels={true}
										smallBarThreshold={0.1}
									/>
								{:else}
									<div class="text-center py-20 text-black opacity-70">
										No transaction data available
									</div>
								{/if}
							</div>
							
							<!-- Net Position Line Chart -->
							<div>
								<h5 class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-3">Current Net Position (Cumulative)</h5>
								{#if capitalWalkData.chartData.length > 0}
									<Chart
										data={capitalWalkData.chartData.map(d => ({
											label: d.date,
											value: d.netPosition
										}))}
										width={640}
										height={250}
										barColor="#ff6b6b"
										valuePrefix="$"
										animate={true}
										showGrid={true}
										showAreaFill={false}
									/>
								{:else}
									<div class="text-center py-10 text-black opacity-70">
										No transaction data available
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Metrics Cards -->
					<div class="space-y-4">
						<div class="bg-white border border-light-gray rounded-none p-4">
							<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-2">External Capital</div>
							<div class="text-xl font-extrabold text-black mb-1 break-all">{currencyDisplay(capitalWalkData.peakNegativePosition)}</div>
							<div class="text-xs text-black opacity-70">Max negative net position</div>
						</div>

						<div class="bg-white border border-light-gray rounded-none p-4">
							<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-2">Gross Capital Deployed</div>
							<div class="text-xl font-extrabold text-black mb-1 break-all">{formatCurrency(capitalWalkData.grossDeployed)}</div>
							<div class="text-xs text-black opacity-70">Total invested</div>
						</div>

						<div class="bg-white border border-light-gray rounded-none p-4">
							<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-2">Gross Payout</div>
							<div class="text-xl font-extrabold text-primary mb-1 break-all">{currencyDisplay(capitalWalkData.grossPayout)}</div>
							<div class="text-xs text-black opacity-70">Total distributions</div>
						</div>

						<div class="bg-white border border-light-gray rounded-none p-4">
							<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-2">Current Net Position</div>
							<div class="text-xl font-extrabold {capitalWalkData.currentNetPosition >= 0 ? 'text-green-600' : 'text-red-600'} mb-1 break-all">
								{currencyDisplay(capitalWalkData.currentNetPosition)}
							</div>
							<div class="text-xs text-black opacity-70">Total Payouts - Total Invested</div>
						</div>
					</div>
				</div>
				
			{:else if activeTab === 'allocation'}
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<div>
							<SectionTitle level="h3" size="subsection" className="mb-6">Asset Allocation</SectionTitle>
							<Card hoverable={false}>
							<CardContent>
								<div class="flex items-center justify-center" style="min-height: 320px;">
									{#if tokenAllocations.length > 0}
										<PieChart
											data={tokenAllocations.map(allocation => ({
												label: allocation.assetName,
												value: allocation.currentValue,
												percentage: allocation.percentageOfPortfolio
											}))}
											width={280}
											height={280}
											showLabels={true}
											showLegend={false}
											animate={true}
										/>
									{:else}
										<p class="text-black opacity-60">No portfolio data available</p>
									{/if}
								</div>
							</CardContent>
						</Card>
					</div>

					<div>
						<SectionTitle level="h3" size="subsection" className="mb-6">Allocation Breakdown</SectionTitle>
						<div class="space-y-4">
								{#if tokenAllocations.length === 0}
									<Card hoverable={false}>
									<CardContent>
										<p class="text-center text-black opacity-60 py-8">
											No allocations to display
										</p>
									</CardContent>
								</Card>
							{:else}
								{#each tokenAllocations as allocation (allocation.assetId)}
									<div class="flex justify-between items-center pb-4 border-b border-light-gray last:border-b-0 last:pb-0">
										<div class="flex items-center gap-3">
											<div class="w-8 h-8 bg-light-gray rounded-none overflow-hidden flex items-center justify-center">
												<div class="text-base opacity-50">🛢️</div>
											</div>
											<div>
												<div class="font-extrabold text-black text-sm">{allocation.assetName}</div>
											<div class="text-xs text-black opacity-70">
												{allocation.tokenSymbol} • {formatNumber(allocation.tokensOwned, { decimals: 3 })} tokens
												</div>
											</div>
										</div>
										<div class="text-right">
											<div class="font-extrabold text-black text-sm">
												{allocation.percentageOfPortfolio.toFixed(1)}%
											</div>
											<div class="text-xs text-black opacity-70">
												{formatCurrency(allocation.currentValue)}
											</div>
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</ContentSection>
		
		<!-- Quick Actions -->
		<FullWidthSection background="gray" padding="standard">
			<div class="text-center">
				<SectionTitle level="h2" size="section" center className="mb-12">Quick Actions</SectionTitle>
				<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
					<ActionCard
						title="Add Investment"
						description="Diversify with new assets"
						icon="➕"
						actionText="Browse Assets"
						actionVariant="primary"
						href="/assets"
						size="medium"
					/>

					<ActionCard
						title="Claim Payouts"
						description={claimsDataUnavailable ? 'Some data could not be loaded' : `${formatCurrency(unclaimedPayout)} available`}
						icon="💰"
						actionText="Claim Now"
						actionVariant="claim"
						href="/claims"
						size="medium"
					/>

					<ActionCard
						title="Export Data"
						description="Tax & accounting reports"
						icon="📥"
						actionText="Download"
						actionVariant="secondary"
						size="medium"
						disabled={!hasPortfolioHistory}
						on:action={exportPortfolioHistory}
					/>
				</div>
			</div>
		</FullWidthSection>
	</PageLayout>
{/if}
