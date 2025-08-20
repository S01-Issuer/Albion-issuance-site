<script lang="ts">
	import { useClaimsService, useCatalogService } from '$lib/services';
	import { web3Modal, signerAddress, connected } from 'svelte-wagmi';
	import { Card, CardContent, PrimaryButton, SecondaryButton, StatsCard, SectionTitle, CollapsibleSection } from '$lib/components/components';
	import { PageLayout, HeroSection, ContentSection } from '$lib/components/layout';
	import { formatCurrency } from '$lib/utils/formatters';
	import { sftRepository } from '$lib/data/repositories/sftRepository';
	import { formatEther } from 'viem';

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
		const claims = useClaimsService();
		const catalog = useCatalogService();
		await catalog.build();

		const result = await claims.loadClaimsForWallet($signerAddress || '');
		claimHistory = result.claimHistory as any;
		holdings = result.holdings as any;
		unclaimedPayout = result.totals.unclaimed;
		totalPayoutsEarned = result.totals.earned;
		activeAssetsCount = holdings.length;

		const deposits = await sftRepository.getDepositsForOwner($signerAddress || '');
		totalInvested = deposits ? deposits.reduce((sum: number, d: any) => sum + Number(formatEther(BigInt(d.amount))), 0) : 0;

		pageLoading = false;
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
			<div class="text-center mt-8">Loading...</div>
		{:else}
			<div class="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-8 text-center max-w-6xl mx-auto mt-6">
				<StatsCard title="Portfolio Value" value={formatCurrency(totalInvested, { compact: true })} subtitle="Total Value" size="small" />
				<StatsCard title="Total Earned" value={formatCurrency(totalPayoutsEarned, { compact: true })} subtitle="All Payouts" size="small" />
				<StatsCard title="Active Assets" value={activeAssetsCount.toString()} subtitle="Assets" size="small" />
			</div>
		{/if}
	</HeroSection>

	{#if !$connected || !$signerAddress}
		<ContentSection background="white" padding="large" centered>
			<div class="text-center">
				<SectionTitle level="h1" size="page" center>Wallet Connection Required</SectionTitle>
				<p class="text-lg text-black opacity-80 mb-8 max-w-md">Please connect your wallet to view your portfolio.</p>
				<PrimaryButton on:click={connectWallet}>Connect Wallet</PrimaryButton>
			</div>
		</ContentSection>
	{:else if !pageLoading}
		<ContentSection background="white" padding="standard">
			<SectionTitle level="h2" size="section">My Holdings</SectionTitle>
			<div class="grid grid-cols-1 gap-4 lg:gap-6 mt-4">
				{#each holdings as group}
					<Card>
						<CardContent>
							<div class="flex items-center justify-between">
								<div>
									<div class="font-extrabold text-black">{group.fieldName}</div>
									<div class="text-xs text-black opacity-70">Royalty • Holdings</div>
								</div>
								<div class="text-right">
									<div class="text-base text-black">Unclaimed</div>
									<div class="text-lg font-extrabold text-primary">{formatCurrency(group.totalAmount)}</div>
								</div>
							</div>
							<div class="mt-3 flex gap-2 justify-end">
								<SecondaryButton>Claim</SecondaryButton>
								<SecondaryButton>Export</SecondaryButton>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		</ContentSection>

		<ContentSection background="gray" padding="standard">
			<CollapsibleSection title="Performance & Returns" isOpenByDefault={false} alwaysOpenOnDesktop={true}>
				<div class="text-black">Performance metrics and Returns</div>
			</CollapsibleSection>
		</ContentSection>

		<ContentSection background="white" padding="standard">
			<CollapsibleSection title="Allocation Breakdown" isOpenByDefault={false} alwaysOpenOnDesktop={true}>
				<div class="text-black">Distribution of investments</div>
			</CollapsibleSection>
		</ContentSection>

		<ContentSection background="white" padding="standard">
			<CollapsibleSection title="Monthly Payouts History" isOpenByDefault={false} alwaysOpenOnDesktop={true}>
				<div class="text-black">Monthly payout data and history</div>
			</CollapsibleSection>
		</ContentSection>
	{/if}
</PageLayout>