<script lang="ts">
	import { writeContract, simulateContract } from '@wagmi/core';
	import { web3Modal, signerAddress, wagmiConfig, connected } from 'svelte-wagmi';
	import { Card, CardContent, PrimaryButton, SecondaryButton, StatusBadge, StatsCard, SectionTitle, CollapsibleSection, FormattedNumber } from '$lib/components/components';
	import { PageLayout, HeroSection, ContentSection } from '$lib/components/layout';
	import { formatCurrency } from '$lib/utils/formatters';
	import { dateUtils } from '$lib/utils/dateHelpers';
	import { arrayUtils } from '$lib/utils/arrayHelpers';
    import { ENERGY_FIELDS, type Claim } from '$lib/network';
    import { getTradesForClaims } from '$lib/queries/getTrades';
    import { decodeOrder, getLeaf, getMerkleTree, signContext, sortClaimsData, getProofForLeaf, fetchAndValidateCSV, type ClaimHistory, type ClaimSignedContext } from '$lib/utils/claims';
    import { formatEther, parseEther, type Hex } from 'viem';
	import orderbookAbi from '$lib/abi/orderbook.json';
    import { getOrder } from '$lib/queries/getOrder';

	let totalEarned = 0;
	let totalClaimed = 0;
	let unclaimedPayout = 0;
	let pageLoading = true;
	let claiming = false;
	let claimSuccess = false;

	let estimatedGas = 0;

	let holdings: { fieldName: string; totalAmount: number; holdings: ClaimSignedContext[] }[] = [];
	let claimHistory: ClaimHistory[] = [];
	let currentPage = 1;
	const itemsPerPage = 20;
	
	// CSV cache to avoid re-fetching
	const csvCache = new Map<string, any[]>();

	// Reset data when wallet changes
	$: if ($signerAddress) {
		// Clear existing data when wallet changes
		totalEarned = 0;
		totalClaimed = 0;
		unclaimedPayout = 0;
		holdings = [];
		claimHistory = [];
		currentPage = 1;
		pageLoading = true;
		claimSuccess = false;
	}

	// Load claims data when wallet is connected and page is loading
	$: if ($connected && $signerAddress && pageLoading) {
		loadClaimsData();
	}

	function loadClaimsData(){
		async function fetchCsvData(csvLink: string, expectedMerkleRoot: string, expectedContentHash: string): Promise<any[] | null> {
			// Check cache first
			if (csvCache.has(csvLink)) {
				return csvCache.get(csvLink)!;
			}
			
			try {
				// Use secure CSV fetching with validation
				const csvData = await fetchAndValidateCSV(csvLink, expectedMerkleRoot, expectedContentHash);
				if (!csvData) {
					throw new Error('CSV validation failed');
				}
				
				// Cache the validated result
				csvCache.set(csvLink, csvData);
				return csvData;
			} catch (error) {
				console.error('Error fetching or validating CSV data:', error);
				return null;
			}
		}

		async function loadAllClaimsData() {
			// Collect all CSV fetch promises
			const csvFetchPromises = [];
			
			for (const field of ENERGY_FIELDS) {
				for (const token of field.sftTokens) {
					if (token.claims && token.claims.length > 0) {
						for (const claim of token.claims) {
							if (claim.csvLink) {
								csvFetchPromises.push(
									fetchCsvData(claim.csvLink, claim.expectedMerkleRoot, claim.expectedContentHash).then(csvData => ({
										csvData,
										claim,
										field,
										token
									}))
								);
							}
						}
					}
				}
			}
			
			// Fetch all CSVs in parallel
			const csvResults = await Promise.all(csvFetchPromises);
			
			// Process results
			for (const { csvData, claim, field, token } of csvResults) {
				if (csvData) {
					const parsedData = csvData; // Already parsed by fetchAndValidateCSV
					const merkleTree = getMerkleTree(parsedData);
					
					const trades = await getTradesForClaims(claim.orderHash, $signerAddress || '', field.name);
					const orderDetails = await getOrder(claim.orderHash)
					if(orderDetails && orderDetails.length > 0){
						const orderBookAddress = orderDetails[0].orderbook.id;
						const decodedOrder = decodeOrder(orderDetails[0].orderBytes)
						const sortedClaimsData = await sortClaimsData(parsedData, trades, $signerAddress || '', field.name);
						const holdingsWithProofs = sortedClaimsData.holdings.map(holding => {
							const leaf = getLeaf(holding.id, $signerAddress || '', holding.unclaimedAmount);
							const proofForLeaf = getProofForLeaf(merkleTree, leaf);
							const holdingSignedContext = signContext(
								[holding.id, parseEther(holding.unclaimedAmount.toString()), ...proofForLeaf.proof].map(i => BigInt(i))
							)
							return {
								...holding,
								order: decodedOrder,
								signedContext: holdingSignedContext,
								orderBookAddress: orderBookAddress
							}
						})
						
						claimHistory = [...claimHistory, ...sortedClaimsData.claims];
						
						// Group holdings by energy field and aggregate amounts
						const fieldName = field.name;
						
						// Find existing group for this field
						let existingGroup = holdings.find(group => group.fieldName === fieldName);
						
						if (existingGroup) {
							// Add new holdings to existing group
							existingGroup.holdings = [...existingGroup.holdings, ...holdingsWithProofs];
							// Recalculate total amount
							existingGroup.totalAmount = existingGroup.holdings.reduce((sum, holding) => 
								sum + Number(holding.unclaimedAmount), 0
							);
						} else {
							// Create new group
							const totalAmount = holdingsWithProofs.reduce((sum, holding) => 
								sum + Number(holding.unclaimedAmount), 0
							);
							holdings = [...holdings, { 
								fieldName, 
								totalAmount, 
								holdings: holdingsWithProofs 
							}];
						}
						if (sortedClaimsData?.totalClaimedAmount) {
							totalClaimed += Number(formatEther(BigInt(sortedClaimsData.totalClaimedAmount)));
						}
						if (sortedClaimsData?.totalEarned) {
							totalEarned += Number(formatEther(BigInt(sortedClaimsData.totalEarned)));
						}
						if (sortedClaimsData?.totalUnclaimedAmount) {
							unclaimedPayout += Number(formatEther(BigInt(sortedClaimsData.totalUnclaimedAmount)));
						}
					}
				}
			}
			pageLoading = false;
		}

		// Load the data when the function is called
		loadAllClaimsData();
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	async function connectWallet() {
		if ($web3Modal) {
			$web3Modal.open();
		}
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

			// Simulate transaction first
			const { request } = await simulateContract($wagmiConfig, {
				abi: orderbookAbi,
				address: holdings[0].holdings[0].orderBookAddress as Hex,
				functionName: 'takeOrders2',
				args: [takeOrdersConfig]
			});

			// Execute transaction after successful simulation
			await writeContract($wagmiConfig, request);
			claimSuccess = true;

		} catch {
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

			// Simulate transaction first
			const { request } = await simulateContract($wagmiConfig, {
				abi: orderbookAbi,
				address: group.holdings[0].orderBookAddress as Hex,
				functionName: 'takeOrders2',
				args: [takeOrdersConfig]
			});

			// Execute transaction after successful simulation
			await writeContract($wagmiConfig, request);
			claimSuccess = true;

		} catch {
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
			<!-- Main Stats - Simplified for mobile -->
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
				<!-- Third stat only on larger screens -->
				<div class="hidden lg:block">
					<StatsCard
						title="Total Claimed"
						value={formatCurrency(totalClaimed, { compact: true })}
						subtitle="Withdrawn"
						size="large"
					/>
				</div>
			</div>

			<!-- Claim Action -->
			{#if unclaimedPayout > 0}
				<div class="text-center mt-6 lg:mt-8">
					<PrimaryButton 
						on:click={claimAllPayouts} 
						disabled={claiming}
					>
						{claiming ? 'Processing...' : `Claim ${formatCurrency(unclaimedPayout)}`}
					</PrimaryButton>
					<p class="text-sm text-gray-600 mt-2">Estimated gas fee: US${estimatedGas.toFixed(2)}</p>
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
											{group.totalAmount > 0 ? 'Claim' : 'No Claims'}
										</SecondaryButton>
									</div>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			</ContentSection>
		{/if}

		<!-- Expandable Statistics Section - Hidden on mobile by default -->
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
					<SecondaryButton size="small" on:click={() => exportClaimHistory()}>📊 Export</SecondaryButton>
				</div>
				
				{#if claimHistory.length > 0}
					<div class="bg-white border border-light-gray overflow-hidden rounded-lg">
						<div class="overflow-x-auto">
							<table class="w-full">
								<thead>
									<tr class="bg-light-gray border-b border-light-gray">
										<th class="text-left p-3 lg:p-4 text-xs text-black uppercase tracking-wide font-bold">Date</th>
										<th class="text-left p-3 lg:p-4 text-xs text-black uppercase tracking-wide font-bold">Asset</th>
										<th class="text-left p-3 lg:p-4 text-xs text-black uppercase tracking-wide font-bold">Amount</th>
										<th class="text-center p-3 lg:p-4 text-xs text-black uppercase tracking-wide font-bold hidden sm:table-cell">Transaction</th>
									</tr>
								</thead>
								<tbody>
									{#each claimHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage) as claim}
										<tr class="border-b border-light-gray hover:bg-light-gray transition-colors">
											<td class="p-3 lg:p-4 text-sm text-black">{formatDate(claim.date)}</td>
											<td class="p-3 lg:p-4 text-sm text-black">{claim.asset}</td>
											<td class="p-3 lg:p-4 text-sm text-black font-semibold">
												<FormattedNumber value={claim.amount} type="currency" compact={Number(claim.amount) >= 10000} />
											</td>
											<td class="p-3 lg:p-4 text-center hidden sm:table-cell">
												<a 
													href="https://basescan.org/tx/{claim.txHash}" 
													target="_blank" 
													rel="noopener noreferrer"
													class="text-xs text-secondary hover:text-black transition-colors inline-flex items-center gap-1 font-mono"
												>
													{claim.txHash.slice(0, 10)}...
													<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
														<polyline points="15,3 21,3 21,9"/>
														<line x1="10" y1="14" x2="21" y2="3"/>
													</svg>
												</a>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						
						<!-- Pagination Controls -->
						{#if claimHistory.length > itemsPerPage}
							{@const totalPages = Math.ceil(claimHistory.length / itemsPerPage)}
							<div class="flex justify-center items-center gap-2 mt-4">
								<button 
									class="px-3 py-1 text-sm border border-light-gray rounded disabled:opacity-50"
									disabled={currentPage === 1}
									on:click={() => currentPage = Math.max(1, currentPage - 1)}
								>
									Previous
								</button>
								
								<span class="text-sm text-gray-600">
									{currentPage} of {totalPages}
								</span>
								
								<button 
									class="px-3 py-1 text-sm border border-light-gray rounded disabled:opacity-50"
									disabled={currentPage === totalPages}
									on:click={() => currentPage = Math.min(totalPages, currentPage + 1)}
								>
									Next
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<div class="text-center py-8 text-gray-500">
						<p>No claim history yet. Your first claims will appear here.</p>
					</div>
				{/if}
			</CollapsibleSection>
		</ContentSection>
	{/if}
</PageLayout>