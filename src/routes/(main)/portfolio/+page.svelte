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
		FormattedNumber,
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
	unclaimedAmount: number;
	claimedAmount: number;
	totalEarned: number;
	holdings: ClaimsHoldingsGroup['holdings'];
}

type EnrichedDeposit = DepositWithReceipt & {
	sftAddress?: string;
	sftName?: string;
	timestamp?: string;
};

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
	totalExternalCapital: number;
	houseMoneyCrossDate: string | null;
	grossDeployed: number;
	grossPayout: number;
	currentNetPosition: number;
}

interface PortfolioHolding {
	id: string;
	name: string;
	location: string;
	totalInvested: number;
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
	asset?: PinnedMetadata['asset'];
	sftAddress: string;
	claimHistory: ClaimsHistoryItem[];
	pinnedMetadata: PinnedMetadata;
}

// Tab state
let activeTab: PortfolioTab = 'overview';
	
	// Page state
	let pageLoading = true;
	let isLoadingData = false;
	let totalInvested = 0;
	let totalPayoutsEarned = 0;
	let unclaimedPayout = 0;
	let activeAssetsCount = 0;
	let holdings: PortfolioHolding[] = [];
	let claimHistory: ClaimsHistoryItem[] = [];
	let monthlyPayouts: MonthlyPayout[] = [];
	let tokenAllocations: TokenAllocationEntry[] = [];
let allDepositsData: EnrichedDeposit[] = [];
let claimsHoldings: ClaimGroupSummary[] = [];
let hasPortfolioHistory = false;
	
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

$: hasPortfolioHistory = (Array.isArray(allDepositsData) && allDepositsData.length > 0) || (Array.isArray(claimHistory) && claimHistory.length > 0);

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

			const location = holding.asset?.location
				? [holding.asset.location.state, holding.asset.location.country]
						.filter(Boolean)
						.join(', ')
				: holding.location || '';

			return {
				asset: holding.asset?.assetName || holding.name || 'Unknown Asset',
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
		// Use ClaimsService for efficient parallel loading with caching
		const claims = useClaimsService();
		
		// Check cache first
		let claimsResult: ClaimsResult | null = claimsCache.get($signerAddress || '');
	if (claimsResult) {
		logDev('Using cached claims data');
	} else {
		logDev('Loading fresh claims data');
		claimsResult = await claims.loadClaimsForWallet($signerAddress || '');
		claimsCache.set($signerAddress || '', claimsResult);
	}
		
		return claimsResult;
	}

	async function loadSftData() {
		if (isLoadingData || !$signerAddress) return;
		isLoadingData = true;
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

			// Load all claims data using ClaimsService
			const claimsResult = await loadAllClaimsData();
			
			// Use the claims result
			if (claimsResult) {
				claimHistory = claimsResult.claimHistory;
				totalPayoutsEarned = claimsResult.totals.earned;
				unclaimedPayout = claimsResult.totals.unclaimed;

				// Map holdings to claimsHoldings format with derived totals
				claimsHoldings = claimsResult.holdings.map((group: ClaimsHoldingsGroup) => {
					const groupClaims = claimsResult.claimHistory.filter(
						(claim) =>
							claim.fieldName === group.fieldName ||
							claim.asset === group.fieldName,
					);
					const totalEarned = groupClaims.reduce((sum, claim) => {
						const amount = Number(claim.amount ?? 0);
						return sum + (Number.isFinite(amount) ? amount : 0);
					}, 0);
					const claimedAmount = groupClaims.reduce((sum, claim) => {
						const amount = Number(claim.amount ?? 0);
						const isCompleted = !claim.status || claim.status === 'completed';
						return sum + (isCompleted && Number.isFinite(amount) ? amount : 0);
					}, 0);
					const unclaimedAmount = Number(group.totalAmount ?? 0);
					return {
						fieldName: group.fieldName,
						unclaimedAmount: Number.isFinite(unclaimedAmount) ? unclaimedAmount : 0,
						claimedAmount,
						totalEarned,
						holdings: group.holdings,
					};
				});
			}

			// Get deposits data
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

			// Process deposit data with timestamps
			const enrichedDeposits: EnrichedDeposit[] = [];
			if (allDepositsData && allDepositsData.length > 0) {
				for(const sft of $sfts) {
					const sftDeposits = allDepositsData.filter(
						(deposit) =>
							deposit.offchainAssetReceiptVault?.id?.toLowerCase() ===
							sft.id.toLowerCase(),
					);
					
					for(const deposit of sftDeposits) {
						enrichedDeposits.push({
							...deposit,
							sftAddress: sft.id,
							sftName: sft.name || sft.id,
							timestamp: new Date().toISOString()
						});
					}
				}
				// Only replace if we have enriched deposits
				if (enrichedDeposits.length > 0) {
					allDepositsData = enrichedDeposits;
				}
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

					// Get ALL deposits for this specific SFT and sum them
					const sftDeposits = allDepositsData.filter(
						(deposit) =>
							deposit.offchainAssetReceiptVault?.id?.toLowerCase() ===
							sft.id.toLowerCase(),
					);
					
					// Sum all deposits for this SFT
					let totalInvestedInSft = 0;
					let tokensOwned = 0;

					if (sftDeposits.length > 0) {
						for (const deposit of sftDeposits) {
							const amountRaw = deposit.amount ?? '0';
							const amountWei =
								typeof amountRaw === 'bigint' ? amountRaw : BigInt(amountRaw);
							const depositAmount = Number(formatEther(amountWei));
							totalInvestedInSft += depositAmount;
							tokensOwned += depositAmount;
						}
					}

					if (tokensOwned === 0 && Array.isArray(sft.tokenHolders)) {
						const tokenHolder = sft.tokenHolders.find(
							(holder) =>
								holder.address?.toLowerCase() === $signerAddress.toLowerCase(),
						);
						if (tokenHolder) {
							// Fallback to on-chain balance when the subgraph has no deposit records
							const holderBalance = Number(
								formatEther(BigInt(tokenHolder.balance)),
							);
							tokensOwned = holderBalance;
							if (totalInvestedInSft === 0) {
								totalInvestedInSft = holderBalance;
							}
						}
					}
					
					let totalEarnedForSft = 0;
					let unclaimedAmountForSft = 0;
					let claimedAmountForSft = 0;
					
					// Find claims data for this specific SFT by matching field name
					const sftClaimsGroup = claimsHoldings.find(
						(group) => group.fieldName === assetFieldName,
					);
					
					// Use data from claimsGroup if available (this is the source of truth)
					if(sftClaimsGroup) {
						claimedAmountForSft = sftClaimsGroup.claimedAmount || 0;
						unclaimedAmountForSft = sftClaimsGroup.unclaimedAmount || 0;
						totalEarnedForSft = sftClaimsGroup.totalEarned || 0;
					}
					
					// Get claim history for this asset
					const sftClaims = claimHistory.filter(
						(claim) => claim.asset === asset.assetName || claim.fieldName === asset.assetName,
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
					if (!totalEarnedForSft && totalEarnedFromHistory) {
						totalEarnedForSft = totalEarnedFromHistory;
					}
					if (!claimedAmountForSft && claimedFromHistory) {
						claimedAmountForSft = claimedFromHistory;
					}
					if (!unclaimedAmountForSft) {
						const pending = totalEarnedForSft - claimedAmountForSft;
						unclaimedAmountForSft = pending > 0 ? pending : 0;
					}
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
						const capitalReturned = totalInvestedInSft > 0 
							? (totalEarnedForSft / totalInvestedInSft) * 100 
							: 0;

						const unrecoveredCapital = Math.max(0, totalInvestedInSft - totalEarnedForSft);

						const lastClaim = sftClaims
							.filter((claim) => !claim.status || claim.status === 'completed')
							.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

						holdings.push({
							id: sft.id.toLowerCase(),
							name: assetFieldName || `SFT ${sft.id.slice(0, 8)}...`,
							location: asset.location
								? `${asset.location.state || 'Unknown'}, ${asset.location.country || 'Unknown'}`
								: 'Unknown',
							totalInvested: totalInvestedInSft,
							totalPayoutsEarned: totalEarnedForSft,
							unclaimedAmount: unclaimedAmountForSft,
							claimedAmount: claimedAmountForSft,
							lastPayoutAmount: lastClaim ? Number(lastClaim.amount) : 0,
							lastPayoutDate: lastClaim ? lastClaim.date : null,
							status: asset.production?.status || 'producing',
							tokensOwned: tokensOwned,
							tokenSymbol: pinnedMetadata.symbol || sft.id.slice(0, 6).toUpperCase(),
							capitalReturned,
							unrecoveredCapital,
							assetDepletion: assetDepletionPercentage,
							asset,
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

			// Process claim history to get monthly aggregations (only completed claims)
			for (const claim of claimHistory) {
				if (claim.date && claim.amount && (!claim.status || claim.status === 'completed')) {
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
					assetName: holding.asset?.assetName || holding.name,
					tokenSymbol: holding.tokenSymbol,
					tokensOwned: holding.tokensOwned,
					currentValue: holding.totalInvested,
					percentageOfPortfolio: allocationPercentage,
				};
			});

			// Calculate portfolio stats
			if (allDepositsData.length > 0) {
				totalInvested = allDepositsData.reduce((sum, deposit) => {
					const amountRaw = deposit?.amount ?? '0';
					const amountWei = typeof amountRaw === 'bigint' ? amountRaw : BigInt(amountRaw);
							const amount = Number(formatEther(amountWei));
					return sum + (Number.isFinite(amount) ? amount : 0);
				}, 0);
			} else if (holdings.length > 0) {
				totalInvested = holdings.reduce((sum, holding) => sum + holding.totalInvested, 0);
			} else {
				totalInvested = 0;
			}

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
					<StatsCard title="Total Earned" value={formatCurrency(totalPayoutsEarned, { compact: true })} subtitle="All Payouts" size="small" />
					<StatsCard title="Unclaimed" value={formatCurrency(unclaimedPayout, { compact: true })} subtitle="Ready to Claim" size="small" />
					<StatsCard title="Active Assets" value={activeAssetsCount.toString()} subtitle="Assets Held" size="small" />
				</div>
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
								<div class="mb-3">
									<Card hoverable={false} showBorder>
									<CardContent paddingClass="p-6 lg:p-9 h-full flex flex-col justify-between">
												<div class="flex justify-between items-start mb-4 lg:mb-7">
													<div class="flex items-start gap-3 lg:gap-4">
														<div class="w-12 h-12 lg:w-14 lg:h-14 bg-light-gray rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
															{#if holding.asset?.coverImage}
																<img src={getImageUrl(holding.asset.coverImage)} 
																	alt={holding.name} 
																	class="w-full h-full object-cover" />
															{:else}
																<div class="text-xl lg:text-2xl opacity-50">🛢️</div>
															{/if}
														</div>
														<div class="text-left">
															<h4 class="font-extrabold text-black text-base lg:text-lg mb-1">
																{holding.tokenSymbol}
															</h4>
															<div class="text-sm text-black opacity-70 mb-1">{holding.name}</div>
															{#if holding.asset?.location}
																<div class="text-xs text-black opacity-70 mb-2">
																	{holding.asset.location.state}, {holding.asset.location.country}
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

												<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
													<!-- Tokens -->
													<div class="flex flex-col">
														<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2 h-8">
															Tokens
														</div>
										<div class="text-lg lg:text-xl font-extrabold text-black">
											{formatNumber(holding.tokensOwned, { decimals: 3 })}
														</div>
														<div class="text-xs lg:text-sm text-black opacity-70">
															<FormattedNumber value={holding.totalInvested} type="currency" compact={true} />
														</div>
													</div>

													<!-- Payouts to Date -->
													<div class="flex flex-col">
														<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2 h-8">
															Payouts to Date
														</div>
														<div class="text-lg lg:text-xl font-extrabold text-primary">
															{formatCurrency(holding.totalPayoutsEarned)}
														</div>
														<div class="text-xs lg:text-sm text-black opacity-70">Cumulative</div>
													</div>

													<!-- Capital Returned -->
													<div class="relative flex flex-col">
														<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2 flex items-start gap-1 h-8">
															<span>Capital Returned</span>
															<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold cursor-help opacity-70"
																on:mouseenter={() => showTooltipWithDelay('capital-' + holding.id)}
																on:mouseleave={hideTooltip}
																role="button"
																tabindex="0">ⓘ</span>
														</div>
														<div class="text-lg lg:text-xl font-extrabold text-black">
															{formatPercentage(holding.capitalReturned / 100)}
														</div>
														<div class="text-xs lg:text-sm text-black opacity-70">To Date</div>
														{#if isTooltipVisible('capital-' + holding.id)}
															<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-3 rounded text-xs z-[1000] mb-2 w-48">
																The portion of your initial investment already recovered
															</div>
														{/if}
													</div>

													<!-- Asset Depletion -->
													<div class="relative flex flex-col hidden lg:flex">
														<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2 flex items-start gap-1 h-8">
															<span>Est. Asset Depletion</span>
															<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold cursor-help opacity-70"
																on:mouseenter={() => showTooltipWithDelay('depletion-' + holding.id)}
																on:mouseleave={hideTooltip}
																role="button"
																tabindex="0">ⓘ</span>
														</div>
									<div class="text-lg lg:text-xl font-extrabold text-black">
										{holding.assetDepletion !== null && holding.assetDepletion !== undefined ? `${holding.assetDepletion.toFixed(1)}%` : 'TBD'}
									</div>
														<div class="text-xs lg:text-sm text-black opacity-70">To Date</div>
														{#if isTooltipVisible('depletion-' + holding.id)}
															<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-3 rounded text-xs z-[1000] mb-2 w-48">
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
															{formatCurrency(holding.unrecoveredCapital > 0 ? holding.unrecoveredCapital : holding.totalPayoutsEarned - holding.totalInvested)}
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
											{#if historyModalHolding.asset?.location}
												<div class="text-xs text-black opacity-60 mt-1">
													{historyModalHolding.asset.location.state}, {historyModalHolding.asset.location.country}
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
					{/if}
				</div>
				
			{:else if activeTab === 'performance'}
				{@const capitalWalkData = (() => {
					// Aggregate mints (deposits) and payouts by month
					const monthlyMints: Record<string, number> = {};
					const monthlyPayoutsTotals: Record<string, number> = {};
					let maxDeficit = 0;
					let houseMoneyCrossDate: string | null = null;
					
					// Process real monthly payouts data from trades
					monthlyPayouts.forEach(payout => {
						const date = new Date(payout.date);
						const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
						monthlyPayoutsTotals[monthKey] = (monthlyPayoutsTotals[monthKey] ?? 0) + payout.amount;
					});
					
					// Process deposits (mints) from deposits data
					if (allDepositsData.length > 0) {
						for (const deposit of allDepositsData) {
							const timestamp = deposit.timestamp ?? new Date().toISOString();
							const date = new Date(timestamp);
							const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
						const amount = Number(formatEther(BigInt(deposit.amount)));
							monthlyMints[monthKey] =
								(monthlyMints[monthKey] ?? 0) + (Number.isFinite(amount) ? amount : 0);
						}
					} else if (holdings.length > 0) {
						// Fallback: use holdings data if no deposits available
						if (monthlyPayouts.length > 0) {
							const firstPayout = monthlyPayouts[0];
							const investmentDate = new Date(firstPayout.date);
							const monthKey = `${investmentDate.getFullYear()}-${String(investmentDate.getMonth() + 1).padStart(2, '0')}`;
							const totalInvestedAmount = holdings.reduce((sum, holding) => sum + holding.totalInvested, 0);
							monthlyMints[monthKey] = totalInvestedAmount;
						} else {
							const currentDate = new Date();
							const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
							const totalInvestedAmount = holdings.reduce((sum, holding) => sum + holding.totalInvested, 0);
							monthlyMints[monthKey] = totalInvestedAmount;
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
					
					sortedMonths.forEach(monthKey => {
						const monthlyMint = monthlyMints[monthKey] ?? 0;
						const monthlyPayout = monthlyPayoutsTotals[monthKey] ?? 0;
						
						runningCumulativeMints += monthlyMint;
						runningCumulativePayouts += monthlyPayout;
						
						const netPosition = runningCumulativePayouts - runningCumulativeMints;
						maxDeficit = Math.max(maxDeficit, Math.abs(netPosition));
						
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
					
					// Calculate real metrics from deposits and trades data
					const grossDeployed = allDepositsData.reduce(
					(sum, deposit) => sum + Number(formatEther(BigInt(deposit.amount))),
						0,
					);
					
					const grossPayout = claimHistory.reduce((sum, claim) => sum + Number(claim.amount), 0);
					const currentNetPosition = grossPayout - grossDeployed;
					
				return {
					chartData: dataArray,
					totalExternalCapital: maxDeficit,
					houseMoneyCrossDate,
					grossDeployed,
					grossPayout,
					currentNetPosition,
				} as CapitalWalkSummary;
				})()}
				
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
					<!-- Capital Walk Chart -->
					<div class="lg:col-span-2 bg-white border border-light-gray rounded-lg p-6">
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
						<div class="bg-white border border-light-gray rounded-lg p-4 relative overflow-hidden">
							<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-2">Total External Capital</div>
							<div class="text-xl font-extrabold text-black mb-1 break-all">{formatCurrency(capitalWalkData.totalExternalCapital)}</div>
							<div class="text-xs text-black opacity-70">Peak cash required</div>
							<div 
								class="absolute top-4 right-4 w-4 h-4 rounded-full bg-light-gray text-black text-xs flex items-center justify-center cursor-help"
								on:mouseenter={() => showTooltipWithDelay('external-capital')}
								on:mouseleave={hideTooltip}
								role="button"
								tabindex="0"
							>
								?
							</div>
							{#if isTooltipVisible('external-capital')}
								<div class="absolute right-0 top-10 bg-black text-white p-4 rounded text-xs z-10 w-56">
									Max cash you ever had to supply from outside, assuming payouts were available for reinvestment
								</div>
							{/if}
						</div>
						
						<div class="bg-white border border-light-gray rounded-lg p-4 relative overflow-hidden">
							<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-2">Gross Deployed</div>
							<div class="text-xl font-extrabold text-black mb-1 break-all">{formatCurrency(capitalWalkData.grossDeployed)}</div>
							<div class="text-xs text-black opacity-70">Total invested</div>
							<div 
								class="absolute top-4 right-4 w-4 h-4 rounded-full bg-light-gray text-black text-xs flex items-center justify-center cursor-help"
								on:mouseenter={() => showTooltipWithDelay('gross-deployed')}
								on:mouseleave={hideTooltip}
								role="button"
								tabindex="0"
							>
								?
							</div>
							{#if isTooltipVisible('gross-deployed')}
								<div class="absolute right-0 top-10 bg-black text-white p-3 rounded text-xs z-10 w-48">
									Total amount invested across all assets
								</div>
							{/if}
						</div>
						
						<div class="bg-white border border-light-gray rounded-lg p-4 relative overflow-hidden">
							<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-2">Gross Payout</div>
							<div class="text-xl font-extrabold text-primary mb-1 break-all">{formatCurrency(capitalWalkData.grossPayout)}</div>
							<div class="text-xs text-black opacity-70">Total distributions</div>
							<div 
								class="absolute top-4 right-4 w-4 h-4 rounded-full bg-light-gray text-black text-xs flex items-center justify-center cursor-help"
								on:mouseenter={() => showTooltipWithDelay('gross-payout')}
								on:mouseleave={hideTooltip}
								role="button"
								tabindex="0"
							>
								?
							</div>
							{#if isTooltipVisible('gross-payout')}
								<div class="absolute right-0 top-10 bg-black text-white p-3 rounded text-xs z-10 w-48">
									Total distributions received from all assets
								</div>
							{/if}
						</div>
						
						<div class="bg-white border border-light-gray rounded-lg p-4 relative overflow-hidden">
							<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-2">Current Net Position</div>
							<div class="text-xl font-extrabold {capitalWalkData.currentNetPosition >= 0 ? 'text-green-600' : 'text-red-600'} mb-1 break-all">
								{formatCurrency(capitalWalkData.currentNetPosition)}
							</div>
							<div class="text-xs text-black opacity-70">Total Payouts - Total Invested</div>
							<div 
								class="absolute top-4 right-4 w-4 h-4 rounded-full bg-light-gray text-black text-xs flex items-center justify-center cursor-help"
								on:mouseenter={() => showTooltipWithDelay('realised-profit')}
								on:mouseleave={hideTooltip}
								role="button"
								tabindex="0"
							>
								?
							</div>
							{#if isTooltipVisible('realised-profit')}
								<div class="absolute right-0 top-10 bg-black text-white p-3 rounded text-xs z-10 w-48">
									Your current profit/loss position accounting for all investments and payouts received
								</div>
							{/if}
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
											<div class="w-8 h-8 bg-light-gray rounded overflow-hidden flex items-center justify-center">
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
						description={`${formatCurrency(unclaimedPayout)} available`}
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
