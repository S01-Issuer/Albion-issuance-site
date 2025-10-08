<script lang="ts">
	import { sfts, sftMetadata } from '$lib/stores';
	import type { Asset } from '$lib/types/uiTypes';
	import AssetCard from '$lib/components/patterns/assets/AssetCard.svelte';
	import TokenPurchaseWidget from '$lib/components/patterns/TokenPurchaseWidget.svelte';
	import { SecondaryButton, SectionTitle, Card, CardContent } from '$lib/components/components';
	import { PageLayout, HeroSection } from '$lib/components/layout';
	import type { TokenMetadata } from '$lib/types/MetaboardTypes';
	import { groupSftsByEnergyField, type GroupedEnergyField } from '$lib/utils/energyFieldGrouping';
	import { useCatalogService } from '$lib/services';
	import { hasAvailableSupplySync } from '$lib/utils/supplyHelpers';
	import { ENERGY_FIELDS } from '$lib/network';

	// Track if initial load is done to prevent double loading
	let hasInitialized = false;
	let loading = true;
	let showSoldOutAssets = false;
	let featuredTokensWithAssets: Array<{ token: TokenMetadata; asset: Asset }> = [];
	let visibleTokensWithAssets: Array<{ token: TokenMetadata; asset: Asset }> = [];
	let groupedEnergyFields: GroupedEnergyField[] = [];
	let soldOutCount = 0;
	let readyToLoad = false;
	
	// Token purchase widget state
	let showPurchaseWidget = false;
	let selectedAssetId: string | null = null;
	let selectedTokenAddress: string | null = null;
	
	async function loadTokenAndAssets() {
		loading = true;
		try {
			if (!$sftMetadata || !$sfts) {
				featuredTokensWithAssets = [];
				return;
			}

			const catalog = useCatalogService();
			await catalog.build();
			const catalogData = catalog.getCatalog();

			if (!catalogData) {
				throw new Error('Failed to build catalog');
			}

			const tokens = Object.values(catalogData.tokens || {});
			const assetsMap = catalogData.assets || {};

			featuredTokensWithAssets = tokens
				.map((token) => {
					const field = ENERGY_FIELDS.find((f) =>
						f.sftTokens.some((s) => s.address.toLowerCase() === token.contractAddress.toLowerCase()),
					);
					const assetId = field
						? field.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
						: '';
					const asset = assetId ? assetsMap[assetId] : undefined;
					return asset ? { token, asset } : null;
				})
				.filter(Boolean) as Array<{ token: TokenMetadata; asset: Asset }>;
		} catch (err) {
			console.error('Featured tokens loading error:', err);
		} finally {
			loading = false;
		}
	}

	$: readyToLoad = Boolean($sfts && $sftMetadata);
	$: if (readyToLoad && !hasInitialized) {
		hasInitialized = true;
		loadTokenAndAssets();
	}

	$: visibleTokensWithAssets = showSoldOutAssets
		? featuredTokensWithAssets
		: featuredTokensWithAssets.filter((item) => hasAvailableSupplySync(item.token));

	$: groupedEnergyFields = groupSftsByEnergyField(visibleTokensWithAssets);

	$: soldOutCount = featuredTokensWithAssets.filter((item) => !hasAvailableSupplySync(item.token)).length;
	
	function handleBuyTokens(event: CustomEvent) {
		selectedAssetId = event.detail.assetId;
		selectedTokenAddress = event.detail.tokenAddress;
		showPurchaseWidget = true;
	}
	
	function handlePurchaseSuccess(_event: CustomEvent) {
		// Purchase successful - could add user notification here
		showPurchaseWidget = false;
	}
	
	function handleWidgetClose() {
		showPurchaseWidget = false;
		selectedAssetId = null;
		selectedTokenAddress = null;
	}
</script>

<svelte:head>
	<title>Assets - Albion</title>
	<meta name="description" content="Browse available oil field assets for investment" />
</svelte:head>

<PageLayout variant="constrained">
	<!-- Header Section -->
	<HeroSection 
		title="Available Assets"
		subtitle="Browse live energy investment opportunities with real-time production data and transparent returns"
		showBorder={false}
	>
		{#if loading}
			<!-- Loading State -->
			<div class="text-center mt-6 sm:mt-8">
				<p class="text-sm sm:text-base text-black leading-relaxed">Loading assets...</p>
			</div>
		{:else}
			<!-- Assets Grid -->
			<div class="mt-12 sm:mt-16 lg:mt-24">
				{#if groupedEnergyFields.length === 0}
						<!-- No Available Assets -->
						<Card hoverable={false}>
						<CardContent>
							<div class="text-center py-8">
								<SectionTitle level="h3" size="card">No Available Assets</SectionTitle>
								<p class="text-sm sm:text-base text-black leading-relaxed mt-4">
									{showSoldOutAssets ? 'No assets found.' : 'All assets are currently sold out.'}
								</p>
							</div>
						</CardContent>
					</Card>
				{:else}
					<!-- Grouped Assets by Energy Field -->
					<div class="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8 items-stretch">
						{#each groupedEnergyFields as energyField (energyField.id)}
							<AssetCard 
								asset={energyField.asset} 
								token={energyField.tokens} 
								energyFieldId={energyField.id}
								on:buyTokens={handleBuyTokens} 
							/>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</HeroSection>

	<!-- View Sold Out Assets Toggle -->
	{#if !loading && featuredTokensWithAssets.length > 0}
		{#if soldOutCount > 0 && !showSoldOutAssets}
			<div class="text-center mt-8 sm:mt-12">
				<SecondaryButton on:click={() => showSoldOutAssets 	= true}>
					View Sold Out Assets ({soldOutCount})
				</SecondaryButton>
			</div>
		{:else if showSoldOutAssets && soldOutCount > 0}
			<div class="text-center mt-8 sm:mt-12">
				<SecondaryButton on:click={() => showSoldOutAssets = false}>
					Hide Sold Out Assets
				</SecondaryButton>
			</div>
		{/if}
	{/if}
</PageLayout>

<!-- Token Purchase Widget -->
<TokenPurchaseWidget 
	bind:isOpen={showPurchaseWidget}
	tokenAddress={selectedTokenAddress}
	assetId={selectedAssetId}
	on:purchaseSuccess={handlePurchaseSuccess}
	on:close={handleWidgetClose}
/>
