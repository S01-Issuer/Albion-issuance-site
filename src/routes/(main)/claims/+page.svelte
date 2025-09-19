<script lang="ts">
	import { writeContract, simulateContract } from '@wagmi/core';
	import { web3Modal, signerAddress, connected, wagmiConfig } from 'svelte-wagmi';
	import { Card, CardContent, PrimaryButton, SecondaryButton, StatusBadge, StatsCard, SectionTitle, CollapsibleSection, FormattedNumber } from '$lib/components/components';
	import { PageLayout, HeroSection, ContentSection } from '$lib/components/layout';
	import { formatCurrency } from '$lib/utils/formatters';
	import { dateUtils } from '$lib/utils/dateHelpers';
	import { arrayUtils } from '$lib/utils/arrayHelpers';
	import { useClaimsService } from '$lib/services';
	import orderbookAbi from '$lib/abi/orderbook.json';
	import type { Hex } from 'viem';
	import { claimsCache } from '$lib/stores/claimsCache';

	const claimsService = useClaimsService();

	let totalEarned = 0;
	let totalClaimed = 0;
	let unclaimedPayout = 0;
	let pageLoading = true;
	let claiming = false;
	let claimSuccess = false;

	let holdings: { fieldName: string; totalAmount: number; holdings: any[] }[] = [];
	let claimHistory: Array<{ date: string; asset: string; amount: string; txHash: string } > = [];
	let currentPage = 1;
	const itemsPerPage = 20;

	$: if ($connected && $signerAddress && pageLoading) {
		loadClaimsData();
	}

	async function loadClaimsData(){
		try {
			// Check cache first
			const cached = claimsCache.get($signerAddress || '');
			if (cached) {
				console.log('[Claims] Using cached data');
				claimHistory = cached.claimHistory as any;
				holdings = cached.holdings as any;
				totalEarned = cached.totals.earned;
				totalClaimed = cached.totals.claimed;
				unclaimedPayout = cached.totals.unclaimed;
				pageLoading = false;
				return;
			}

			console.log('[Claims] Loading fresh data');
			const result = await claimsService.loadClaimsForWallet($signerAddress || '');
			
			// Store in cache
			claimsCache.set($signerAddress || '', result);
			
			claimHistory = result.claimHistory as any;
			holdings = result.holdings as any;
			totalEarned = result.totals.earned;
			totalClaimed = result.totals.claimed;
			unclaimedPayout = result.totals.unclaimed;
		} catch (error) {
			console.error('Error loading claims:', error);
			// Set defaults on error
			claimHistory = [];
			holdings = [];
			totalEarned = 0;
			totalClaimed = 0;
			unclaimedPayout = 0;
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
			let orders = [];
			
			// Collect all orders from all groups
			for (const group of holdings) {
				for (const holding of group.holdings) {
					orders.push({
						order: holding.order,
						inputIOIndex: 0,
						outputIOIndex: 0,
						signedContext: [holding.signedContext]
					});
				}
			}
			
			const takeOrdersConfig = {
				minimumInput: 0n,
				maximumInput: 2n ** 256n - 1n,
				maximumIORatio: 2n ** 256n - 1n,
				orders: orders,
				data: "0x"
			};

			// Get the orderbook address from the first holding
			const orderbookAddress = holdings[0].holdings[0].orderBookAddress;

			// Simulate transaction first
			const { request } = await simulateContract($wagmiConfig, {
				abi: orderbookAbi,
				address: orderbookAddress as Hex,
				functionName: 'takeOrders2',
				args: [takeOrdersConfig]
			});

			// Execute transaction after successful simulation
			await writeContract($wagmiConfig, request);
			claimSuccess = true;
			
			// Clear cache and reload claims data after successful claim
			claimsService.clearCache();
			claimsCache.clear();
			setTimeout(() => {
				pageLoading = true;
				loadClaimsData();
			}, 2000);

		} catch (error) {
			console.error('Claim all failed:', error);
			claimSuccess = false;
		} finally {
			claiming = false;
		}
	}

	async function handleClaimSingle(group: any) {
		claiming = true;
		try {
			let orders = [];
			
			// Collect all orders from this group
			for (const holding of group.holdings) {
				orders.push({
					order: holding.order,
					inputIOIndex: 0,
					outputIOIndex: 0,
					signedContext: [holding.signedContext]
				});
			}
			
			const takeOrdersConfig = {
				minimumInput: 0n,
				maximumInput: 2n ** 256n - 1n,
				maximumIORatio: 2n ** 256n - 1n,
				orders: orders,
				data: "0x"
			};

			// Get the orderbook address
			const orderbookAddress = group.holdings[0].orderBookAddress;

			// Simulate transaction first
			const { request } = await simulateContract($wagmiConfig, {
				abi: orderbookAbi,
				address: orderbookAddress as Hex,
				functionName: 'takeOrders2',
				args: [takeOrdersConfig]
			});

			// Execute transaction after successful simulation
			await writeContract($wagmiConfig, request);
			claimSuccess = true;
			
			// Clear cache entry for this claim and reload data after success
			const csvLinks = new Set(
				(group.holdings || [])
					.map((holding: any) => holding?.csvLink)
					.filter((link: string | undefined) => typeof link === 'string' && link.length > 0)
			);
			for (const link of csvLinks) {
				claimsService.invalidateCsv(link as string);
			}
			claimsCache.clear();
			setTimeout(() => {
				pageLoading = true;
				loadClaimsData();
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
	{:else}
		<!-- Header -->
		<HeroSection 
			title="Claims & Payouts"
			subtitle="Claim your energy asset payouts and track your claims history"
			showBorder={false}
		>
			<!-- Main Stats -->
			<div class="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-8 mt-8 max-w-4xl mx-auto">
				<StatsCard
					title="Available to Claim"
					value={formatCurrency(unclaimedPayout, { compact: true })}
					subtitle="Ready now"
					size="large"
					valueColor="primary"
				/>
				<StatsCard
					title="Total Earned"
					value={formatCurrency(totalEarned, { compact: true })}
					subtitle="All time"
					size="large"
				/>
				<div class="hidden lg:block">
					<StatsCard
						title="Total Claimed"
						value={formatCurrency(totalClaimed, { compact: true })}
						subtitle="Withdrawn"
						size="large"
					/>
				</div>
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
					{#each holdings as group}
						<Card>
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
									{#each paginatedHistory as claim}
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
														href={`https://basescan.org/tx/${claim.txHash}`}
														target="_blank"
														rel="noopener noreferrer"
														class="text-secondary hover:underline text-sm"
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