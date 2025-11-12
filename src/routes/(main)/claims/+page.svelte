<script lang="ts">
	import { writeContract, simulateContract } from '@wagmi/core';
	import { derived, get } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';
	import { web3Modal, signerAddress, connected, wagmiConfig, chainId } from 'svelte-wagmi';
	import { Card, CardContent, PrimaryButton, SecondaryButton, StatusBadge, StatsCard, SectionTitle, CollapsibleSection, FormattedNumber } from '$lib/components/components';
	import { PageLayout, HeroSection, ContentSection } from '$lib/components/layout';
	import { graphQLCache } from '$lib/data/clients/cachedGraphqlClient';
	import { formatCurrency } from '$lib/utils/formatters';
	import { dateUtils } from '$lib/utils/dateHelpers';
	import { arrayUtils } from '$lib/utils/arrayHelpers';
	import { BASE_ORDERBOOK_SUBGRAPH_URL } from '$lib/network';
	import { getTxUrl } from '$lib/utils/explorer';
	import { useClaimsService } from '$lib/services';
	import orderbookAbi from '$lib/abi/orderbook.json';
	import type { Hex } from 'viem';
	import { claimsCache } from '$lib/stores/claimsCache';
	import type { ClaimsHoldingsGroup } from '$lib/services/ClaimsService';
	import type { ClaimHistory } from '$lib/utils/claims';

	const claimsService = useClaimsService();
	const isDev = import.meta.env.DEV;
	const logDev = (...messages: unknown[]) => {
		if (isDev) console.warn('[Claims]', ...messages);
	};

	let totalEarned = 0;
	let totalClaimed = 0;
	let unclaimedPayout = 0;
	let pageLoading = true;
	let claiming = false;
	let claimSuccess = false;
	let dataLoadError = false;

	let holdings: ClaimsHoldingsGroup[] = [];
	let claimHistory: ClaimHistory[] = [];
	let currentPage = 1;
	const itemsPerPage = 20;

	const walletState = derived([connected, signerAddress], ([$connected, $signerAddress]) => ({
		connected: $connected,
		address: $signerAddress ?? ''
	}));

	let unsubscribeWallet: (() => void) | null = null;

	function invalidateClaimData() {
		// Force subsequent loads to re-fetch orderbook data after a claim
		graphQLCache.invalidate(BASE_ORDERBOOK_SUBGRAPH_URL);
	}

	function updateClaimsCacheSnapshot() {
		if (dataLoadError) return;
		const address = get(signerAddress) ?? '';
		if (!address) return;
		claimsCache.set(address, {
			holdings,
			claimHistory,
			totals: {
				earned: totalEarned,
				claimed: totalClaimed,
				unclaimed: unclaimedPayout
			},
			hasCsvLoadError: false
		});
	}

	function resetClaimsState() {
		claimHistory = [];
		holdings = [];
		totalEarned = 0;
		totalClaimed = 0;
		unclaimedPayout = 0;
	}

	function applyClaimOptimisticUpdate(claimGroup?: ClaimsHoldingsGroup) {
		if (claimGroup) {
			const claimedAmount = claimGroup.totalAmount ?? 0;
			if (claimedAmount > 0) {
				totalClaimed += claimedAmount;
				unclaimedPayout = Math.max(unclaimedPayout - claimedAmount, 0);
			}
			holdings = holdings
				.map((group) =>
					group.fieldName === claimGroup.fieldName
						? { ...group, totalAmount: 0, holdings: [] }
						: group
				)
				.filter((group) => group.totalAmount > 0 && group.holdings.length > 0);
			updateClaimsCacheSnapshot();
			return;
		}

		const claimedAmount = unclaimedPayout;
		if (claimedAmount > 0) {
			totalClaimed += claimedAmount;
		}
		unclaimedPayout = 0;
		holdings = [];
		updateClaimsCacheSnapshot();
	}

	onMount(() => {
		subscribeToWallet();
	});

	onDestroy(() => {
		unsubscribeWallet?.();
	});

	function subscribeToWallet() {
		unsubscribeWallet = walletState.subscribe(({ connected, address }) => {
			if (connected && address) {
				loadClaimsData(address);
			}
		});
	}

	async function loadClaimsData(addressOverride?: string, forceFresh = false) {
		pageLoading = true;
		dataLoadError = false;
		try {
			const cacheKey = addressOverride ?? $signerAddress ?? '';
			if (!cacheKey) {
				pageLoading = false;
				return;
			}
			const cached = forceFresh ? null : claimsCache.get(cacheKey);
			if (cached) {
				logDev('Using cached data');
				dataLoadError = !!cached.hasCsvLoadError;
				if (dataLoadError) {
					resetClaimsState();
					pageLoading = false;
					return;
				}
				claimHistory = cached.claimHistory;
				holdings = cached.holdings;
				totalEarned = cached.totals.earned;
				totalClaimed = cached.totals.claimed;
				unclaimedPayout = cached.totals.unclaimed;
				pageLoading = false;
				return;
			}

			logDev('Loading fresh data');
			const result = await claimsService.loadClaimsForWallet(cacheKey);
			
			// Store in cache
			dataLoadError = !!result.hasCsvLoadError;
			if (!dataLoadError) {
				claimsCache.set(cacheKey, result);
			}
			
			if (!dataLoadError) {
				claimHistory = result.claimHistory;
				holdings = result.holdings;
				totalEarned = result.totals.earned;
				totalClaimed = result.totals.claimed;
				unclaimedPayout = result.totals.unclaimed;
				updateClaimsCacheSnapshot();
			} else {
				resetClaimsState();
			}
		} catch (error) {
			console.error('Error loading claims:', error);
			// Set defaults on error
			resetClaimsState();
			dataLoadError = true;
		} finally {
			pageLoading = false;
		}
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	async function connectWallet() {
		if ($web3Modal) $web3Modal.open();
	}

	async function claimAllPayouts() {
		claiming = true;
		try {
			if (holdings.length === 0 || holdings[0].holdings.length === 0) {
				throw new Error('No holdings available to claim');
			}

			const orders: Array<{
				order: ClaimsHoldingsGroup['holdings'][number]['order'];
				inputIOIndex: number;
				outputIOIndex: number;
				signedContext: readonly ClaimsHoldingsGroup['holdings'][number]['signedContext'][];
			}> = [];
			
			// Collect all orders from all groups
			for (const group of holdings) {
				for (const holding of group.holdings) {
					orders.push({
						order: holding.order,
						inputIOIndex: 0,
						outputIOIndex: 0,
						signedContext: [holding.signedContext],
					});
				}
			}
			
			const takeOrdersConfig = {
				minimumInput: 0n,
				maximumInput: 2n ** 256n - 1n,
				maximumIORatio: 2n ** 256n - 1n,
				orders,
				data: "0x"
			};

			// Get the orderbook address from the first holding
			const orderbookAddress = holdings[0].holdings[0].orderBookAddress as Hex;

			// Simulate transaction first
			const { request } = await simulateContract($wagmiConfig, {
				abi: orderbookAbi,
				address: orderbookAddress,
				functionName: 'takeOrders2',
				args: [takeOrdersConfig]
			});

			// Execute transaction after successful simulation
			await writeContract($wagmiConfig, request);
			claimSuccess = true;
			
			applyClaimOptimisticUpdate();
			// Invalidate caches and reload claims data after successful claim
			invalidateClaimData();
			setTimeout(() => {
				const address = get(signerAddress) ?? '';
				if (!address) return;
				loadClaimsData(address, true);
			}, 2000);

		} catch (error) {
			console.error('Claim all failed:', error);
			claimSuccess = false;
		} finally {
			claiming = false;
		}
	}

	async function handleClaimSingle(group: ClaimsHoldingsGroup) {
		claiming = true;
		try {
			if (!group.holdings.length) {
				throw new Error('No orders available for this claim group');
			}
			const orders: Array<{
				order: ClaimsHoldingsGroup['holdings'][number]['order'];
				inputIOIndex: number;
				outputIOIndex: number;
				signedContext: readonly ClaimsHoldingsGroup['holdings'][number]['signedContext'][];
			}> = [];
			
			// Collect all orders from this group
			for (const holding of group.holdings) {
				orders.push({
					order: holding.order,
					inputIOIndex: 0,
					outputIOIndex: 0,
					signedContext: [holding.signedContext],
				});
			}
			
			const takeOrdersConfig = {
				minimumInput: 0n,
				maximumInput: 2n ** 256n - 1n,
				maximumIORatio: 2n ** 256n - 1n,
				orders,
				data: "0x"
			};

			// Get the orderbook address
			const orderbookAddress = group.holdings[0].orderBookAddress as Hex;

			// Simulate transaction first
			const { request } = await simulateContract($wagmiConfig, {
				abi: orderbookAbi,
				address: orderbookAddress,
				functionName: 'takeOrders2',
				args: [takeOrdersConfig]
			});

			// Execute transaction after successful simulation
			await writeContract($wagmiConfig, request);
			claimSuccess = true;
			
			applyClaimOptimisticUpdate(group);
				// Invalidate caches and reload claims data after successful claim
			invalidateClaimData();
			setTimeout(() => {
				const address = get(signerAddress) ?? '';
				if (!address) return;
				loadClaimsData(address, true);
			}, 2000);

		} catch (error) {
			console.error('Claim single failed:', error);
			claimSuccess = false;
		} finally {
			claiming = false;
		}
	}

	function exportClaimHistory() {
		const headers = ['Date', 'Asset', 'Amount', 'Transaction Hash'];
		const csvContent = [
			headers.join(','),
			...claimHistory.map(claim => [
				formatDate(claim.date),
				`"${claim.asset}"`,
				claim.amount,
				claim.txHash
			].join(','))
		].join('\n');
		
		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'albion-claim-history.csv';
		link.click();
		window.URL.revokeObjectURL(url);
	}

	// Pagination for claims history
	$: paginatedHistory = claimHistory.slice(
		(currentPage - 1) * itemsPerPage,
		currentPage * itemsPerPage
	);
	$: totalPages = Math.ceil(claimHistory.length / itemsPerPage);
</script>

<svelte:head>
	<title>Claims - Albion</title>
	<meta name="description" content="Claim your energy asset payouts and view your payout history." />
</svelte:head>

<PageLayout>
	{#if !$connected || !$signerAddress}
		<HeroSection 
			title="Connect Your Wallet"
			subtitle="Connect your wallet to view and claim your energy asset payouts"
			showBorder={false}
		>
			<div class="text-center mt-8">
				<PrimaryButton on:click={connectWallet}>Connect Wallet</PrimaryButton>
			</div>
		</HeroSection>
	{:else if pageLoading}
		<ContentSection background="white" padding="standard" centered>
			<div class="text-center">
				<div class="w-8 h-8 border-4 border-light-gray border-t-primary animate-spin mx-auto mb-4"></div>
				<p>Loading your claims data...</p>
			</div>
		</ContentSection>
	{:else if dataLoadError}
		<ContentSection background="white" padding="standard" centered>
			<div class="text-center py-16 px-4" role="alert" aria-live="assertive">
				<p class="text-3xl font-black text-black mb-4">Unable to load data.</p>
				<p class="text-lg text-black opacity-80 max-w-2xl mx-auto">
					This might be due to unusually high IPFS traffic. Please try again later.
				</p>
			</div>
		</ContentSection>
	{:else}
		<!-- Header -->
		<HeroSection 
			title="Claims & Payouts"
			subtitle="Claim your energy asset payouts and track your claims history"
			showBorder={false}
		>
				<!-- Main Stats -->
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-8 text-center mt-8 max-w-6xl mx-auto">
					<StatsCard
						title="Available to Claim"
						value={formatCurrency(unclaimedPayout, { compact: true })}
						subtitle="Ready now"
						size="small"
						valueColor="primary"
					/>
					<StatsCard
						title="Total Earned"
						value={formatCurrency(totalEarned, { compact: true })}
						subtitle="All time"
						size="small"
					/>
					<StatsCard
						title="Total Claimed"
						value={formatCurrency(totalClaimed, { compact: true })}
						subtitle="Withdrawn"
						size="small"
					/>
					<StatsCard
						title="Claims Processed"
						value={claimHistory.length.toString()}
						subtitle="All time"
						size="small"
					/>
				</div>

			<!-- Claim All Action -->
			{#if unclaimedPayout > 0}
				<div class="text-center mt-6 lg:mt-8">
					<PrimaryButton
						on:click={claimAllPayouts}
						disabled={claiming}
						size="large"
					>
						{claiming ? 'Processing...' : `Claim All (${formatCurrency(unclaimedPayout)})`}
					</PrimaryButton>
				</div>
			{/if}

			{#if claimSuccess}
				<div class="text-center mt-4 p-4 bg-green-100 text-green-800 rounded-lg max-w-md mx-auto">
					✅ Claim successful! Tokens have been sent to your wallet.
				</div>
			{/if}
		</HeroSection>

		<!-- Available Claims by Asset -->
		{#if holdings.length > 0}
			<ContentSection background="white" padding="standard">
				<SectionTitle level="h2" size="section" className="mb-6">Claims by Asset</SectionTitle>
				
				<div class="grid grid-cols-1 gap-4 lg:gap-6">
						{#each holdings as group (group.fieldName)}
							<Card hoverable={false}>
							<CardContent paddingClass="p-4 lg:p-6">
								<div class="grid grid-cols-1 sm:grid-cols-4 lg:grid-cols-5 gap-4 items-center">
									<div class="sm:col-span-2">
										<div class="font-extrabold text-black text-sm lg:text-base">{group.fieldName}</div>
										<div class="text-xs lg:text-sm text-black opacity-70">{group.holdings.length} claims</div>
									</div>
									<div class="text-center sm:text-left lg:text-center">
										<StatusBadge 
											status="PRODUCING"
											size="small"
											showIcon={true}
										/>
									</div>
									<div class="text-center">
										<div class="text-lg lg:text-xl font-extrabold text-primary mb-1">
											<FormattedNumber value={group.totalAmount} type="currency" compact={group.totalAmount >= 10000} />
										</div>
										<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wide">Available</div>
									</div>
									<div class="text-center">
										<SecondaryButton 
											size="small" 
											disabled={claiming || group.totalAmount <= 0}
											on:click={() => handleClaimSingle(group)}
											fullWidth
										>
											{claiming ? 'Processing...' : 'Claim'}
										</SecondaryButton>
									</div>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			</ContentSection>
		{:else if !pageLoading}
			<ContentSection background="white" padding="standard">
				<div class="text-center py-12">
					<h3 class="text-xl font-bold text-black mb-4">No Claims Available</h3>
					<p class="text-black opacity-70">You don't have any unclaimed payouts at this time.</p>
				</div>
			</ContentSection>
		{/if}

		<!-- Expandable Statistics Section -->
		<ContentSection background="gray" padding="standard">
			<CollapsibleSection title="Detailed Statistics" isOpenByDefault={false} alwaysOpenOnDesktop={true}>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
					<StatsCard
						title="Total Payouts"
						value={claimHistory.length.toString()}
						subtitle="This year"
						size="medium"
					/>
					<StatsCard
						title="Days Since Last Claim"
						value={(() => {
							if (claimHistory.length === 0) return 'N/A';
							const lastClaim = arrayUtils.latest(claimHistory, claim => claim.date);
							if (!lastClaim) return 'N/A';
							const daysSince = dateUtils.daysBetween(new Date(lastClaim.date), new Date());
							return Math.max(0, daysSince).toString();
						})()}
						subtitle="Since last withdrawal"
						size="medium"
					/>
					<StatsCard
						title="Number of Claims"
						value={claimHistory.length.toString()}
						subtitle="Lifetime total"
						size="medium"
					/>
					<StatsCard
						title="Average Claim Size"
						value={claimHistory.length > 0 ? formatCurrency(totalClaimed / claimHistory.length) : '$0'}
						subtitle="Per transaction"
						valueColor="primary"
						size="medium"
					/>
				</div>
			</CollapsibleSection>
		</ContentSection>

		<!-- Expandable Claim History Section -->
		<ContentSection background="white" padding="standard">
			<CollapsibleSection title="Claim History" isOpenByDefault={false} alwaysOpenOnDesktop={true}>
				<div class="flex justify-between items-center mb-6">
					<div class="text-sm text-gray-600">{claimHistory.length} total claims</div>
					<SecondaryButton size="small" on:click={exportClaimHistory}>📊 Export</SecondaryButton>
				</div>
				
				{#if claimHistory.length === 0}
					<div class="text-center py-8">
						<p class="text-black opacity-70">No claim history available yet.</p>
					</div>
				{:else}
					<div class="bg-white border border-light-gray overflow-hidden rounded-lg">
						<div class="overflow-x-auto">
							<table class="w-full">
								<thead>
									<tr class="bg-light-gray border-b border-light-gray">
										<th class="text-left p-4 font-bold text-xs uppercase text-black opacity-70">Date</th>
										<th class="text-left p-4 font-bold text-xs uppercase text-black opacity-70">Asset</th>
										<th class="text-right p-4 font-bold text-xs uppercase text-black opacity-70">Amount</th>
										<th class="text-center p-4 font-bold text-xs uppercase text-black opacity-70">Status</th>
										<th class="text-center p-4 font-bold text-xs uppercase text-black opacity-70">Action</th>
									</tr>
								</thead>
								<tbody>
									{#each paginatedHistory as claim (claim.txHash || claim.date)}
										<tr class="border-b border-light-gray last:border-0 hover:bg-light-gray/10 transition-colors">
											<td class="p-4 text-sm text-black">
												{formatDate(claim.date)}
											</td>
											<td class="p-4 text-sm text-black font-medium">
												{claim.asset}
											</td>
											<td class="p-4 text-sm text-right text-black font-extrabold">
												{formatCurrency(Number(claim.amount))}
											</td>
											<td class="p-4 text-center">
												<StatusBadge 
													status="completed" 
													size="small"
													variant="available"
												/>
											</td>
											<td class="p-4 text-center">
												{#if claim.txHash}
													<a 
														href={getTxUrl(claim.txHash, $chainId)}
														target="_blank"
														rel="noopener noreferrer"
														class="text-secondary text-sm no-underline hover:text-primary"
													>
														View TX →
													</a>
												{:else}
													<span class="text-black opacity-50 text-sm">-</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						
						{#if totalPages > 1}
							<div class="flex justify-center items-center gap-2 p-4 border-t border-light-gray">
								<SecondaryButton 
									size="small" 
									on:click={() => currentPage = Math.max(1, currentPage - 1)}
									disabled={currentPage === 1}
								>
									Previous
								</SecondaryButton>
								<span class="px-4 text-sm text-black">
									Page {currentPage} of {totalPages}
								</span>
								<SecondaryButton 
									size="small" 
									on:click={() => currentPage = Math.min(totalPages, currentPage + 1)}
									disabled={currentPage === totalPages}
								>
									Next
								</SecondaryButton>
							</div>
						{/if}
					</div>
				{/if}
			</CollapsibleSection>
		</ContentSection>
	{/if}
</PageLayout>
