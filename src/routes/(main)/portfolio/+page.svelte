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
		CollapsibleSection,
		Modal
	} from '$lib/components/components';
	import { PageLayout, HeroSection, ContentSection, FullWidthSection } from '$lib/components/layout';
	import { formatCurrency, formatPercentage, formatNumber, formatSmartNumber } from '$lib/utils/formatters';
	import { sftRepository } from '$lib/data/repositories/sftRepository';
	import { sfts, sftMetadata } from '$lib/stores';
	import { formatEther } from 'viem';
	import { goto } from '$app/navigation';
	import { useTooltip } from '$lib/composables';
	import { getImageUrl } from '$lib/utils/imagePath';
	import { decodeSftInformation } from '$lib/decodeMetadata/helpers';
	
	// Tab state
	let activeTab: 'overview' | 'performance' | 'allocation' = 'overview';
	
	// Page state
	let pageLoading = true;
	let isLoadingData = false;
	let totalInvested = 0;
	let totalPayoutsEarned = 0;
	let totalClaimed = 0;
	let unclaimedPayout = 0;
	let activeAssetsCount = 0;
	let holdings: any[] = [];
	let claimHistory: any[] = [];
	let monthlyPayouts: any[] = [];
	let tokenAllocations: any[] = [];
	let allDepositsData: any[] = [];
	let claimsHoldings: any[] = [];
	
	// Composables
	const { show: showTooltipWithDelay, hide: hideTooltip, isVisible: isTooltipVisible } = useTooltip();

	let historyModalPayoutData: Array<{ date: string; value: number }> = [];
	let historyModalCumulativeData: Array<{ label: string; value: number }> = [];
	let historyModalOpen = false;
	let historyModalHolding: any | null = null;

	$: historyModalPayoutData = historyModalHolding ? getPayoutChartData(historyModalHolding) : [];
	$: historyModalCumulativeData = historyModalPayoutData.reduce((acc: Array<{ label: string; value: number }>, d, i) => {
		const prevTotal = i > 0 ? acc[i - 1].value : 0;
		acc.push({ label: d.date, value: prevTotal + d.value });
		return acc;
	}, [] as Array<{ label: string; value: number }>);

	function openHistoryModal(holding: any) {
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

	async function fetchCsvData(csvLink: string) {
		try {
			const response = await fetch(csvLink);
			if (!response.ok) {
				throw new Error(`Failed to fetch CSV: ${response.status}`);
			}
			const csvText = await response.text();
			return csvText;
		} catch (error) {
			console.error('Error fetching CSV data:', error);
			return null;
		}
	}

	async function parseCsvData(csvText: string) {
		const lines = csvText.split('\n');
		const headers = lines[0].split(',').map(h => h.trim());
		const data = lines.slice(1).filter(line => line.trim()).map(line => {
			const values = line.split(',').map(v => v.trim());
			const row: any = {};
			headers.forEach((header, index) => {
				row[header] = values[index] || '';
			});
			return row;
		});
		return data;
	}

	async function downloadCSVDebugData(data: any, filename: string) {
		const jsonData = JSON.stringify(data, null, 2);
		const blob = new Blob([jsonData], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function loadAllClaimsData() {
		// Use ClaimsService for efficient parallel loading with caching
		const claims = useClaimsService();
		
		// Check cache first
		let claimsResult = claimsCache.get($signerAddress || '');
		if (claimsResult) {
			console.log('[Portfolio] Using cached claims data');
		} else {
			console.log('[Portfolio] Loading fresh claims data');
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
				totalClaimed = claimsResult.totals.claimed;
				unclaimedPayout = claimsResult.totals.unclaimed;
				
				// Map holdings to claimsHoldings format for compatibility
				claimsHoldings = claimsResult.holdings.map((group: any) => ({
					fieldName: group.fieldName,
					unclaimedAmount: group.totalAmount,
					claimedAmount: 0, // Will be calculated from claim history
					totalEarned: group.totalAmount,
					holdings: group.holdings
				}));
			}

			// Get deposits data
			allDepositsData = await sftRepository.getDepositsForOwner($signerAddress);

			if (!$sfts || !$sftMetadata || $sfts.length === 0 || $sftMetadata.length === 0) {
				pageLoading = false;
				isLoadingData = false;
				return;
			}

			// Decode metadata
			const decodedMeta = $sftMetadata.map((metaV1: any) => decodeSftInformation(metaV1));

			// Process deposit data with timestamps
			const enrichedDeposits = [];
			if (allDepositsData && allDepositsData.length > 0) {
				for(const sft of $sfts) {
					const sftDeposits = allDepositsData.filter((d: any) => 
						d.offchainAssetReceiptVault?.id?.toLowerCase() === sft.id.toLowerCase()
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
			const uniqueSfts = Array.from(new Map($sfts.map((sft: any) => [sft.id.toLowerCase(), sft])).values());

			// Process each individual SFT token
			for(const sft of uniqueSfts) {
				// Find metadata for this SFT
				const pinnedMetadata = decodedMeta.find(
					(meta: any) => {
						if (!meta?.contractAddress) return false;
						// Try direct match first
						const metaAddress = meta.contractAddress.toLowerCase();
						const sftAddress = sft.id.toLowerCase();
						if (metaAddress === sftAddress) {
							return true;
						}
						// Try padded match (for compatibility)
						const targetAddress = `0x000000000000000000000000${sft.id.slice(2).toLowerCase()}`;
						if (metaAddress === targetAddress) {
							return true;
						}
						// Try removing padding from metadata address
						const unpaddedMetaAddress = metaAddress.replace(/^0x0+/, '0x');
						if (unpaddedMetaAddress === sftAddress) {
							return true;
						}
						return false;
					}
				);
				
				if(pinnedMetadata) {
					const asset = (pinnedMetadata as any).asset;
					
					// Get ALL deposits for this specific SFT and sum them
					const sftDeposits = allDepositsData ? allDepositsData.filter((d: any) => 
						d.offchainAssetReceiptVault?.id?.toLowerCase() === sft.id.toLowerCase()
					) : [];
					
					// Sum all deposits for this SFT
					let totalInvestedInSft = 0;
					let tokensOwned = 0;

					if(sftDeposits.length > 0) {
						for(const deposit of sftDeposits) {
							const depositAmount = Number(formatEther(deposit.amount));
							totalInvestedInSft += depositAmount;
							tokensOwned += depositAmount;
						}
					}

					if(tokensOwned === 0 && Array.isArray(sft.tokenHolders)) {
						const tokenHolder = sft.tokenHolders.find((holder: any) =>
							holder.address?.toLowerCase() === $signerAddress.toLowerCase()
						);
						if(tokenHolder) {
							// Fallback to on-chain balance when the subgraph has no deposit records
							const holderBalance = Number(formatEther(tokenHolder.balance));
							tokensOwned = holderBalance;
							if(totalInvestedInSft === 0) {
								totalInvestedInSft = holderBalance;
							}
						}
					}
					
					let totalEarnedForSft = 0;
					let unclaimedAmountForSft = 0;
					let claimedAmountForSft = 0;
					
					// Find claims data for this specific SFT by matching field name
					const sftClaimsGroup = claimsHoldings.find(group => 
						group.fieldName === asset?.assetName
					);
					
					// Use data from claimsGroup if available (this is the source of truth)
					if(sftClaimsGroup) {
						claimedAmountForSft = sftClaimsGroup.claimedAmount || 0;
						unclaimedAmountForSft = sftClaimsGroup.unclaimedAmount || 0;
						totalEarnedForSft = sftClaimsGroup.totalEarned || 0;
					}
					
					// Get claim history for this asset
					const sftClaims = claimHistory.filter((claim: any) => {
						// Match by asset name since that's what ClaimsService provides
						return claim.asset === asset?.assetName || claim.fieldName === asset?.assetName;
					});
					
					// Only add to holdings if user actually owns tokens
					if(pinnedMetadata && tokensOwned > 0) {
						const capitalReturned = totalInvestedInSft > 0 
							? (totalEarnedForSft / totalInvestedInSft) * 100 
							: 0;
						
						const unrecoveredCapital = Math.max(0, totalInvestedInSft - totalEarnedForSft);
						
						// Get last payout info from claims
						const lastClaim = sftClaims
							.filter(claim => !claim.status || claim.status === 'completed')
							.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
						
						holdings.push({
							id: sft.id.toLowerCase(),
							name: asset?.assetName || `SFT ${sft.id.slice(0, 8)}...`,
							location: asset ? `${asset.location?.state || 'Unknown'}, ${asset.location?.country || 'Unknown'}` : 'Unknown',
							totalInvested: totalInvestedInSft,
							totalPayoutsEarned: totalEarnedForSft,
							unclaimedAmount: unclaimedAmountForSft,
							lastPayoutAmount: lastClaim ? Number(lastClaim.amount) : 0,
							lastPayoutDate: lastClaim ? lastClaim.date : null,
							status: asset?.production?.status || 'producing',
							tokensOwned: tokensOwned,
							tokenSymbol: (pinnedMetadata as any)?.symbol || sft.id.slice(0, 6).toUpperCase(),
							capitalReturned,
							unrecoveredCapital,
							assetDepletion: 0,
							asset: asset,
							sftAddress: sft.id,
							claimHistory: sftClaims,
							pinnedMetadata: pinnedMetadata
						});
					}
				}
			}

					// Populate monthlyPayouts from claim history
			monthlyPayouts = [];
			const monthlyPayoutsMap = new Map();

			// Process claim history to get monthly aggregations (only completed claims)
			for(const claim of claimHistory) {
				if(claim.date && claim.amount && (!claim.status || claim.status === 'completed')) {
					const date = new Date(claim.date);
					const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
					
					const amount = Number(claim.amount);
					monthlyPayoutsMap.set(monthKey, (monthlyPayoutsMap.get(monthKey) || 0) + amount);
				}
			}

			for(const [monthKey, amount] of monthlyPayoutsMap) {
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
			tokenAllocations = holdings.map(holding => {
				const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.totalInvested, 0);
				const allocationPercentage = totalPortfolioValue > 0 ? (holding.totalInvested / totalPortfolioValue) * 100 : 0;
				
				return {
					assetId: holding.id,
					assetName: holding.asset?.assetName || holding.name,
					tokenSymbol: holding.tokenSymbol,
					tokensOwned: holding.tokensOwned,
					currentValue: holding.totalInvested,
					percentageOfPortfolio: allocationPercentage
				};
			});

			// Calculate portfolio stats
			if (allDepositsData.length > 0) {
				totalInvested = allDepositsData.reduce((sum, deposit) => sum + Number(formatEther(deposit.amount)), 0);
			} else if (holdings.length > 0) {
				totalInvested = holdings.reduce((sum, holding) => sum + holding.totalInvested, 0);
			} else {
				totalInvested = 0;
			}

			if (holdings.length > 0) {
				totalPayoutsEarned = holdings.reduce((sum, holding) => sum + holding.totalPayoutsEarned, 0);
				unclaimedPayout = holdings.reduce((sum, holding) => sum + holding.unclaimedAmount, 0);
			} else {
				totalPayoutsEarned = 0;
				unclaimedPayout = 0;
			}

			activeAssetsCount = holdings.length;

		} catch (error) {
			console.error('[Portfolio] Error loading data:', error);
		} finally {
			pageLoading = false;
			isLoadingData = false;
		}
	}
	
	function getPayoutChartData(holding: any): Array<{date: string; value: number}> {
		if (!holding.claimHistory || holding.claimHistory.length === 0) {
			return [];
		}
		
		return holding.claimHistory
			.filter((claim: any) => claim.date && claim.amount)
			.map((claim: any) => ({
				date: new Date(claim.date).toISOString().split('T')[0],
				value: Number(claim.amount)
			}))
			.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
						<Card>
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
						{#each holdings as holding}
							<div class="mb-3">
								<Card hoverable showBorder>
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
															{formatNumber(holding.tokensOwned)}
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
															{holding.assetDepletion > 0 ? `${holding.assetDepletion.toFixed(1)}%` : 'TBD'}
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
												<div class="text-lg font-extrabold text-black">{formatNumber(historyModalHolding.tokensOwned)}</div>
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
					const monthlyMints = new Map();
					const monthlyPayoutsMap = new Map();
					let maxDeficit = 0;
					let houseMoneyCrossDate: string | null = null;
					
					// Process real monthly payouts data from trades
					monthlyPayouts.forEach(payout => {
						const date = new Date(payout.date);
						const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
						monthlyPayoutsMap.set(monthKey, (monthlyPayoutsMap.get(monthKey) || 0) + payout.amount);
					});
					
					// Process deposits (mints) from deposits data
					if (allDepositsData.length > 0) {
						for(const deposit of allDepositsData) {
							const date = new Date(deposit.timestamp);
							const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
							const amount = Number(formatEther(deposit.amount));
							monthlyMints.set(monthKey, (monthlyMints.get(monthKey) || 0) + amount);
						}
					} else if (holdings.length > 0) {
						// Fallback: use holdings data if no deposits available
						if (monthlyPayouts.length > 0) {
							const firstPayout = monthlyPayouts[0];
							const investmentDate = new Date(firstPayout.date);
							const monthKey = `${investmentDate.getFullYear()}-${String(investmentDate.getMonth() + 1).padStart(2, '0')}`;
							const totalInvestedAmount = holdings.reduce((sum, holding) => sum + holding.totalInvested, 0);
							monthlyMints.set(monthKey, totalInvestedAmount);
						} else {
							const currentDate = new Date();
							const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
							const totalInvestedAmount = holdings.reduce((sum, holding) => sum + holding.totalInvested, 0);
							monthlyMints.set(monthKey, totalInvestedAmount);
						}
					}
					
					// Create chart data from all months
					const allMonths = new Set([...monthlyMints.keys(), ...monthlyPayoutsMap.keys()]);
					const sortedMonths = Array.from(allMonths).sort();
					const dataArray: any[] = [];
					
					let runningCumulativeMints = 0;
					let runningCumulativePayouts = 0;
					
					sortedMonths.forEach(monthKey => {
						const monthlyMint = monthlyMints.get(monthKey) || 0;
						const monthlyPayout = monthlyPayoutsMap.get(monthKey) || 0;
						
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
					const grossDeployed = allDepositsData.reduce((sum, deposit) => 
						sum + Number(formatEther(deposit.amount)), 0
					);
					
					const grossPayout = claimHistory.reduce((sum, claim) => sum + Number(claim.amount), 0);
					const currentNetPosition = grossPayout - grossDeployed;
					
					return {
						chartData: dataArray,
						totalExternalCapital: maxDeficit,
						houseMoneyCrossDate,
						grossDeployed,
						grossPayout,
						currentNetPosition
					};
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
						<Card>
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
								<Card>
									<CardContent>
										<p class="text-center text-black opacity-60 py-8">
											No allocations to display
										</p>
									</CardContent>
								</Card>
							{:else}
								{#each tokenAllocations as allocation}
									<div class="flex justify-between items-center pb-4 border-b border-light-gray last:border-b-0 last:pb-0">
										<div class="flex items-center gap-3">
											<div class="w-8 h-8 bg-light-gray rounded overflow-hidden flex items-center justify-center">
												<div class="text-base opacity-50">🛢️</div>
											</div>
											<div>
												<div class="font-extrabold text-black text-sm">{allocation.assetName}</div>
												<div class="text-xs text-black opacity-70">
													{allocation.tokenSymbol} • {formatNumber(allocation.tokensOwned)} tokens
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
					/>
				</div>
			</div>
		</FullWidthSection>
	</PageLayout>
{/if}
