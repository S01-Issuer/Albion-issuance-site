<script lang="ts">
	import { useClaimsService, useCatalogService } from '$lib/services';
	import { web3Modal, signerAddress, connected } from 'svelte-wagmi';
	import { Card, CardContent, PrimaryButton, SecondaryButton, StatsCard, SectionTitle } from '$lib/components/components';
	import { PageLayout, HeroSection, ContentSection } from '$lib/components/layout';
	import { formatCurrency } from '$lib/utils/formatters';
	import { sftRepository } from '$lib/data/repositories/sftRepository';
	import { formatEther } from 'viem';
	import { goto } from '$app/navigation';

	let pageLoading = true;
	let totalInvested = 0;
	let totalPayoutsEarned = 0;
	let unclaimedPayout = 0;
	let activeAssetsCount = 0;
	let holdings: Array<{ fieldName: string; totalAmount: number; holdings: any[] }> = [];
	let claimHistory: Array<{ date: string; asset: string; amount: string; txHash: string }> = [];

	$: if ($connected && $signerAddress && pageLoading) {
		loadPortfolioData();
	}

	async function loadPortfolioData() {
		// Only run in browser environment
		if (typeof window === 'undefined') return;
		
		try {
			const claims = useClaimsService();
			const catalog = useCatalogService();
			
			// Try to build catalog, but don't fail if it can't fetch data
			try {
				await catalog.build();
			} catch (catalogError) {
				console.warn('[Portfolio] Catalog build failed, continuing with empty catalog:', catalogError);
			}

			// Try to load claims data
			try {
				const result = await claims.loadClaimsForWallet($signerAddress || '');
				claimHistory = result.claimHistory as any;
				holdings = result.holdings as any;
				unclaimedPayout = result.totals.unclaimed;
				totalPayoutsEarned = result.totals.earned;
				activeAssetsCount = holdings.length;
			} catch (claimsError) {
				console.warn('[Portfolio] Claims loading failed:', claimsError);
				// Set defaults
				claimHistory = [];
				holdings = [];
				unclaimedPayout = 0;
				totalPayoutsEarned = 0;
				activeAssetsCount = 0;
			}

			// Get deposits to calculate total invested
			try {
				const deposits = await sftRepository.getDepositsForOwner($signerAddress || '');
				totalInvested = deposits ? deposits.reduce((sum: number, d: any) => 
					sum + Number(formatEther(BigInt(d.amount))), 0
				) : 0;
			} catch (error) {
				console.warn('[Portfolio] Error fetching deposits:', error);
				totalInvested = 0;
			}
		} catch (error) {
			console.error('[Portfolio] Unexpected error loading data:', error);
			// Set all to defaults
			claimHistory = [];
			holdings = [];
			unclaimedPayout = 0;
			totalPayoutsEarned = 0;
			activeAssetsCount = 0;
			totalInvested = 0;
		} finally {
			pageLoading = false;
		}
	}

	async function connectWallet() {
		if ($web3Modal) $web3Modal.open();
	}
</script>

<svelte:head>
	<title>Portfolio - Albion</title>
	<meta name="description" content="Track your investment portfolio performance" />
</svelte:head>

<PageLayout variant="constrained">
	<HeroSection title="My Portfolio" subtitle="Track your investments and performance" showBorder={true}>
		{#if pageLoading}
			<div class="text-center mt-8">
				<div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
				<p class="mt-4 text-black opacity-70">Loading portfolio data...</p>
			</div>
		{:else}
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 lg:gap-8 text-center max-w-6xl mx-auto mt-6">
				<StatsCard title="Portfolio Value" value={formatCurrency(totalInvested, { compact: true })} subtitle="Total Invested" size="small" />
				<StatsCard title="Total Earned" value={formatCurrency(totalPayoutsEarned, { compact: true })} subtitle="All Payouts" size="small" />
				<StatsCard title="Unclaimed" value={formatCurrency(unclaimedPayout, { compact: true })} subtitle="Ready to Claim" size="small" />
				<StatsCard title="Active Assets" value={activeAssetsCount.toString()} subtitle="Assets Held" size="small" />
			</div>
		{/if}
	</HeroSection>

	{#if !$connected || !$signerAddress}
		<ContentSection background="white" padding="large" centered>
			<div class="text-center">
				<SectionTitle level="h1" size="page" center>Wallet Connection Required</SectionTitle>
				<p class="text-lg text-black opacity-80 mb-8 max-w-md mx-auto">
					Please connect your wallet to view your portfolio.
				</p>
				<PrimaryButton on:click={connectWallet}>Connect Wallet</PrimaryButton>
			</div>
		</ContentSection>
	{:else if !pageLoading}
		<ContentSection background="white" padding="standard">
			<div class="flex justify-between items-center mb-6">
				<SectionTitle level="h2" size="section">My Holdings</SectionTitle>
				{#if unclaimedPayout > 0}
					<PrimaryButton on:click={() => goto('/claims')}>
						Claim Payouts ({formatCurrency(unclaimedPayout)})
					</PrimaryButton>
				{/if}
			</div>
			
			{#if holdings.length === 0}
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
				<div class="grid grid-cols-1 gap-4 lg:gap-6">
					{#each holdings as group}
						<Card>
							<CardContent>
								<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
									<div>
										<h3 class="font-extrabold text-lg text-black">{group.fieldName}</h3>
										<div class="text-sm text-black opacity-70 mt-1">
											{group.holdings.length} token{group.holdings.length !== 1 ? 's' : ''} held
										</div>
									</div>
									<div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
										<div class="text-left sm:text-right">
											<div class="text-xs text-black opacity-70">Unclaimed</div>
											<div class="text-xl font-extrabold text-primary">
												{formatCurrency(group.totalAmount)}
											</div>
										</div>
										<div class="flex gap-2">
											<SecondaryButton on:click={() => goto('/claims')}>
												Claim
											</SecondaryButton>
											<SecondaryButton on:click={() => goto(`/assets/${group.fieldName.toLowerCase().replace(/\s+/g, '-')}`)}>
												View Asset
											</SecondaryButton>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</ContentSection>
	{/if}
</PageLayout>