<script lang="ts">
	import { web3Modal, signerAddress, connected } from 'svelte-wagmi';
	import { Card, CardContent, PrimaryButton, SecondaryButton, StatusBadge, StatsCard, SectionTitle, CollapsibleSection, FormattedNumber } from '$lib/components/components';
	import { PageLayout, HeroSection, ContentSection } from '$lib/components/layout';
	import { formatCurrency } from '$lib/utils/formatters';
	import { useClaimsService } from '$lib/services';

	let totalEarned = 0;
	let totalClaimed = 0;
	let unclaimedPayout = 0;
	let pageLoading = true;

	let holdings: { fieldName: string; totalAmount: number; holdings: any[] }[] = [];
	let claimHistory: Array<{ date: string; asset: string; amount: string; txHash: string } > = [];

	$: if ($connected && $signerAddress && pageLoading) {
		loadClaimsData();
	}

	async function loadClaimsData(){
		const claims = useClaimsService();
		const result = await claims.loadClaimsForWallet($signerAddress || '');
		claimHistory = result.claimHistory as any;
		holdings = result.holdings as any;
		totalEarned = result.totals.earned;
		totalClaimed = result.totals.claimed;
		unclaimedPayout = result.totals.unclaimed;
		pageLoading = false;
	}

	async function connectWallet() {
		if ($web3Modal) $web3Modal.open();
	}
</script>

<svelte:head>
	<title>Claims - Albion</title>
	<meta name="description" content="Claim your energy asset payouts and view your payout history." />
</svelte:head>

<PageLayout>
	{#if !$connected || !$signerAddress}
		<HeroSection title="Connect Your Wallet" subtitle="Connect your wallet to view and claim your energy asset payouts" showBorder={false}>
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
		<HeroSection title="Claims & Payouts" subtitle="Claim your energy asset payouts and track your claims history" showBorder={false}>
			<div class="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-8 mt-8 max-w-4xl mx-auto">
				<StatsCard title="Available to Claim" value={formatCurrency(unclaimedPayout, { compact: true })} subtitle="Ready now" size="large" valueColor="primary" />
				<StatsCard title="Total Earned" value={formatCurrency(totalEarned, { compact: true })} subtitle="All time" size="large" />
				<div class="hidden lg:block">
					<StatsCard title="Total Claimed" value={formatCurrency(totalClaimed, { compact: true })} subtitle="Withdrawn" size="large" />
				</div>
			</div>
		</HeroSection>

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
										<StatusBadge status="PRODUCING" size="small" showIcon={true} />
									</div>
									<div class="text-center">
										<div class="text-lg lg:text-xl font-extrabold text-primary mb-1">
											<FormattedNumber value={group.totalAmount} type="currency" compact={group.totalAmount >= 10000} />
										</div>
										<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wide">Available</div>
									</div>
									<div class="text-center">
										<SecondaryButton size="small" disabled={group.totalAmount <= 0}>Claim</SecondaryButton>
									</div>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			</ContentSection>
		{/if}
	{/if}
</PageLayout>