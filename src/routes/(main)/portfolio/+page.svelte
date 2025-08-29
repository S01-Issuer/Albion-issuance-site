<script lang="ts">
	import { useAssetService, useTokenService } from '$lib/services';
	import type { Asset, Token } from '$lib/types/uiTypes';
	import { web3Modal, signerAddress, connected, loading } from 'svelte-wagmi';
	import { Card, CardContent, CardActions, PrimaryButton, SecondaryButton, StatusBadge, TabNavigation, StatsCard, SectionTitle, ActionCard, TabButton, Chart, BarChart, PieChart, CollapsibleSection, FormattedNumber } from '$lib/components/components';
	import { PageLayout, HeroSection, ContentSection, FullWidthSection } from '$lib/components/layout';
	import { formatCurrency, formatPercentage, formatNumber, formatSmartNumber } from '$lib/utils/formatters';
	import { useTooltip, useCardFlip } from '$lib/composables';
    import { sftMetadata, sfts } from '$lib/stores';
    import { ENERGY_FIELDS, PINATA_GATEWAY } from '$lib/network';
    import { decodeOrder, getLeaf, getMerkleTree, getProofForLeaf, signContext, sortClaimsData, type ClaimHistory } from '$lib/utils/claims';
    import { getTradesForClaims } from '$lib/queries/getTrades';
    import { getOrder } from '$lib/queries/getOrder';
    import { formatEther, parseEther } from 'viem';
    import { getAllDeposits } from '$lib/queries/getAllDeposits';
    import { decodeSftInformation } from '$lib/decodeMetadata/helpers';

	let totalInvested = 0;
	let totalPayoutsEarned = 0;
	let unclaimedPayout = 0;
	let activeAssetsCount = 0;
	let activeTab = 'overview';
	let monthlyPayouts: any[] = [];
	let tokenAllocations: any[] = [];
	let pageLoading = true;
	let claimsHoldings: any[] = [];
	let holdings: any[] = [];

	let claimHistory: ClaimHistory[] = [];
	let allTradesData: any[] = [];
	let allDepositsData: any[] = [];
	let isLoadingData = false;

	
	// Use composables
	const { show: showTooltipWithDelay, hide: hideTooltip, isVisible: isTooltipVisible } = useTooltip();
	const { toggle: toggleCardFlip, flippedCards, unflipAll } = useCardFlip();
	
	
	function getPayoutChartData(holding: any): Array<{date: string; value: number}> {
		// First try to use the claim history already stored in the holding object
		if (holding.claimHistory && holding.claimHistory.length > 0) {
			const chartData = holding.claimHistory
				.filter((claim: any) => claim.date && claim.amount)
				.map((claim: any) => ({
					date: new Date(claim.date).toISOString().split('T')[0], // Format as YYYY-MM-DD
					value: Number(claim.amount)
				}))
				.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Sort by date
			
			return chartData;
		}
		
		// Fallback: Get payout history for this specific SFT from global claim history
		const sftClaims = claimHistory.filter(claim => {
			// Match by field name (which is what's stored in claimHistory)
			// The holding name might be "Bakken Horizon-2 Royalty Stream" but claim.asset is "Bakken Horizon-2"
			const holdingNameWords = holding.name.toLowerCase().split(' ');
			const claimAssetWords = claim.asset.toLowerCase().split(' ');
			
			// Check if the field name is contained in the holding name
			const fieldNameMatch = claimAssetWords.every(word => 
				holdingNameWords.includes(word) || holding.name.toLowerCase().includes(word)
			);
			
			// Also check by SFT address as fallback
			const sftAddressMatch = holding.sftAddress && 
				claim.asset.toLowerCase().includes(holding.sftAddress.slice(0, 8).toLowerCase());
			
			return fieldNameMatch || sftAddressMatch;
		});
		
		if (sftClaims.length === 0) {
			
			return [];
		}
		
		// Convert claims data to chart format with proper dates
		const chartData = sftClaims
			.filter(claim => claim.date && claim.amount)
			.map(claim => ({
				date: new Date(claim.date).toISOString().split('T')[0], // Format as YYYY-MM-DD
				value: Number(claim.amount)
			}))
			.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Sort by date
		
		return chartData;
	}


	async function connectWallet() {
		if ($web3Modal) {
			$web3Modal.open();
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

	async function loadAllClaimsData() {
		// Process each individual SFT token instead of grouping by energy fields
		for (const field of ENERGY_FIELDS) {
			for (const token of field.sftTokens) {
				if (token.claims && token.claims.length > 0) {
					for (const claim of token.claims) {
						if (claim.csvLink) {
							const csvText = await fetchCsvData(claim.csvLink);
							if (csvText) {
								const parsedData = await parseCsvData(csvText);
								const merkleTree = getMerkleTree(parsedData);
								
								const trades = await getTradesForClaims(claim.orderHash, $signerAddress || '', field.name);
								
								// Store trades data for monthly payouts
								if (trades && trades.length > 0) {
									allTradesData.push(...trades.map((trade: any) => ({
										...trade,
										fieldName: field.name,
										sftAddress: token.address,
										assetName: field.name
									})));
								}
								
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
											orderBookAddress: orderBookAddress,
											sftAddress: token.address, // Add SFT address for individual tracking
											fieldName: field.name // Keep field name for reference
										}
									})
									
									claimHistory = [...claimHistory, ...sortedClaimsData.claims];
									
									// Calculate SFT-specific amounts from trades under this SFT's orderHash
									// The trades data contains the actual payout amounts for this specific SFT
									const sftTrades = trades.filter((trade: any) => trade.sftAddress === token.address);
									const sftTotalEarned = sftTrades.reduce((sum: number, trade: any) => {
										// Extract the payout amount from the trade data
										// This might need adjustment based on the actual trade data structure
										const tradeAmount = trade.amount || trade.value || 0;
										return sum + Number(tradeAmount);
									}, 0);
									
									// For now, assume all trades are claimed (completed)
									const sftClaimedAmount = sftTotalEarned;
									const sftUnclaimedAmount = 0;
									
									// Check if we already have an entry for this SFT
									let existingSftGroup = claimsHoldings.find(group => group.sftAddress === token.address);
									
									if (existingSftGroup) {
										// Add to existing SFT group
										existingSftGroup.holdings = [...existingSftGroup.holdings, ...holdingsWithProofs];
										// Recalculate total amount
										existingSftGroup.totalAmount = sftTotalEarned;
										existingSftGroup.unclaimedAmount = sftUnclaimedAmount;
										existingSftGroup.claimedAmount = sftClaimedAmount;
									} else {
										// Create new SFT group
										claimsHoldings = [...claimsHoldings, { 
											sftAddress: token.address,
											fieldName: field.name,
											totalAmount: sftTotalEarned,
											unclaimedAmount: sftUnclaimedAmount,
											claimedAmount: sftClaimedAmount,
											holdings: holdingsWithProofs
										}];
									}
									
									// totalClaimed += Number(formatEther(sortedClaimsData.totalClaimedAmount));
									// totalEarned += Number(formatEther(sortedClaimsData.totalEarned));
									// unclaimedPayout2 += Number(formatEther(sortedClaimsData.totalUnclaimedAmount));
								}
							}
						}
					}
				}
			}
		}

		const deposits = await getAllDeposits($signerAddress || '')
		const totalDeposits = deposits ? deposits.reduce((sum: bigint, deposit: any) => {
			if (deposit?.amount) {
				return sum + BigInt(deposit.amount);
			}
			return sum;
		}, BigInt(0)) : BigInt(0)
		
	}

	async function loadSftData(){
		// Prevent multiple simultaneous executions
		if(isLoadingData) {
			console.log('Already loading data, skipping duplicate call');
			return;
		}
		
		isLoadingData = true;
		pageLoading = true;
		
		// Reset all portfolio variables to prevent accumulation across wallet switches
		totalInvested = 0;
		totalPayoutsEarned = 0;
		unclaimedPayout = 0;
		activeAssetsCount = 0;
		monthlyPayouts = [];
		tokenAllocations = [];
		holdings = [];
		claimsHoldings = [];
		
		await loadAllClaimsData();

		if($sftMetadata && $sfts && $sfts.length > 0 && $sftMetadata.length > 0){
			const decodedMeta = $sftMetadata.map((metaV1) => decodeSftInformation(metaV1));
			
			// Get deposits for this wallet
			const deposits = await getAllDeposits($signerAddress || '');
			console.log('All deposits for wallet:', deposits?.length || 0, deposits);
			
			// Log each deposit's details
			if (deposits && deposits.length > 0) {
				deposits.forEach((d: any, i: number) => {
					console.log(`Deposit ${i + 1}:`, {
						vault: d.offchainAssetReceiptVault?.id || 'N/A',
						amount_raw: d.amount,
						amount_formatted: d.amount ? Number(formatEther(d.amount)) : 0
					});
				});
			}
			
			console.log('Processing SFTs:', $sfts.length, $sfts.map(s => s.id));
			
			// Collect deposit data with timestamps from SFT data
			allDepositsData = [];
			if (deposits && deposits.length > 0) {
				for(const sft of $sfts) {
					// Find deposits for this SFT
					const sftDeposits = deposits.filter((d: any) => 
						d.offchainAssetReceiptVault?.id?.toLowerCase() === sft.id.toLowerCase()
					);
					
					// Add deposit data with SFT info
					for(const deposit of sftDeposits) {
						allDepositsData.push({
							...deposit,
							sftAddress: sft.id,
							sftName: sft.name || sft.id,
							// For now, use a default timestamp since getAllDeposits doesn't return timestamps
							// TODO: Get real deposit timestamps from SFT subgraph
							timestamp: new Date().toISOString() // Placeholder
						});
					}
				}
			}
			
			// Deduplicate SFTs by ID in case of duplicates
			const uniqueSfts = Array.from(new Map($sfts.map((sft: any) => [sft.id.toLowerCase(), sft])).values());
			
			// Process each individual SFT token
			for(const sft of uniqueSfts) {
				console.log('Processing SFT:', sft.id);
				
				// Find metadata for this SFT
				const pinnedMetadata = decodedMeta.find(
					(meta) => meta?.contractAddress === `0x000000000000000000000000${sft.id.slice(2)}`
				);
				
				console.log('Found metadata:', pinnedMetadata ? 'yes' : 'no');
				
				if(pinnedMetadata) {
					const asset = (pinnedMetadata as any).asset;
					
					// Get ALL deposits for this specific SFT and sum them
					const sftDeposits = deposits ? deposits.filter((d: any) => 
						d.offchainAssetReceiptVault?.id?.toLowerCase() === sft.id.toLowerCase()
					) : [];
					
					// Sum all deposits for this SFT
					let totalInvested = 0;
					let tokensOwned = 0;
					
					if(sftDeposits.length > 0) {
						console.log(`Deposits for SFT ${sft.id}:`);
						for(const deposit of sftDeposits) {
							console.log(`  - Amount (raw): ${deposit.amount}`);
							const depositAmount = Number(formatEther(deposit.amount));
							console.log(`  - Amount (formatted): ${depositAmount}`);
							totalInvested += depositAmount;
							tokensOwned += depositAmount; // Assuming 1:1 ratio for now
						}
					}
					
					console.log('Found deposits for SFT:', sftDeposits.length, 'Total invested:', totalInvested);
					
					let totalEarned = 0;
					let unclaimedAmount = 0;
					
					// Find claims data for this specific SFT from claimsHoldings
					const sftClaimsGroup = claimsHoldings.find(group => group.sftAddress === sft.id);
					
					// Also get claim history for this SFT
					const sftClaims = claimHistory.filter(claim => {
						// Match by asset name or try to match by SFT address
						return claim.asset.toLowerCase().includes(asset?.name?.toLowerCase() || '') ||
							   claim.asset.toLowerCase().includes(sft.id.slice(0, 8).toLowerCase());
					});
					
					// Calculate total earned and unclaimed from claims
					if(sftClaimsGroup) {
						// Use the grouped claims data for this specific SFT
						totalEarned += sftClaimsGroup.totalAmount;
						unclaimedAmount += sftClaimsGroup.totalAmount; // Assuming all are unclaimed for now
					}
					
					// Also calculate from claim history for additional data
					for(const claim of sftClaims) {
						const claimAmount = Number(claim.amount);
						// Add to total earned if not already counted
						if(!sftClaimsGroup) {
							totalEarned += claimAmount;
						}
						
						// If status is 'completed', it's claimed, otherwise unclaimed
						if(claim.status !== 'completed') {
							if(!sftClaimsGroup) {
								unclaimedAmount += claimAmount;
							}
						}
					}
					
					// Calculate payouts from CSV data for this specific SFT
					// The CSV data contains the actual payout amounts for each SFT
					for (const field of ENERGY_FIELDS) {
						for (const token of field.sftTokens) {
							if (token.address.toLowerCase() === sft.id.toLowerCase()) {
								console.log('Found matching token in ENERGY_FIELDS:', token.address);
								if (token.claims && token.claims.length > 0) {
									console.log('Token has claims:', token.claims.length);
									for (const claim of token.claims) {
										if (claim.csvLink) {
											const csvText = await fetchCsvData(claim.csvLink);
											if (csvText) {
												const parsedData = await parseCsvData(csvText);
												const trades = await getTradesForClaims(claim.orderHash, $signerAddress || '', field.name);
												
												if (trades && trades.length > 0) {
													// Process the CSV data to get actual payout amounts for this SFT
													const sortedClaimsData = await sortClaimsData(parsedData, trades, $signerAddress || '', field.name);
													
													// Add the total earned amount from CSV data
													let csvTotalEarned = 0;
													if (sortedClaimsData?.totalEarned) {
														csvTotalEarned = Number(formatEther(BigInt(sortedClaimsData.totalEarned)));
														totalEarned += csvTotalEarned;
													}
													
													// Add unclaimed amount from CSV data
													let csvUnclaimedAmount = 0;
													if (sortedClaimsData?.totalUnclaimedAmount) {
														csvUnclaimedAmount = Number(formatEther(BigInt(sortedClaimsData.totalUnclaimedAmount)));
														unclaimedAmount += csvUnclaimedAmount;
													}
													
													console.log('CSV data processed - totalEarned:', csvTotalEarned, 'unclaimedAmount:', csvUnclaimedAmount);
												} else {
													console.log('No trades found for claim');
												}
											} else {
												console.log('Failed to fetch CSV data');
											}
										}
									}
								} else {
									console.log('Token has no claims');
								}
							}
						}
					}
					
					console.log('Final values for SFT:', {
						totalInvested,
						totalEarned,
						unclaimedAmount,
						tokensOwned
					});
					
					// Only add to holdings if user actually owns tokens (has made deposits)
					if(pinnedMetadata && tokensOwned > 0) {
						const capitalReturned = totalInvested > 0 
							? (totalEarned / totalInvested) * 100 
							: 0;
						
						const unrecoveredCapital = Math.max(0, totalInvested - totalEarned);
						
						// Create a unique ID for this SFT
						const sftId = sft.id.toLowerCase();
						
						// Get last payout info from claims
						const lastClaim = sftClaims
							.filter(claim => claim.status === 'completed')
							.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
						
						holdings.push({
							id: sftId,
							name: asset?.assetName || `SFT ${sft.id.slice(0, 8)}...`,
							location: asset ? `${asset.location?.state || 'Unknown'}, ${asset.location?.country || 'Unknown'}` : 'Unknown',
							totalInvested: totalInvested,
							totalPayoutsEarned: totalEarned,
							unclaimedAmount: unclaimedAmount,
							lastPayoutAmount: lastClaim ? Number(lastClaim.amount) : 0,
							lastPayoutDate: lastClaim ? lastClaim.date : null,
							status: asset?.production?.status || 'unknown',
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
			
			// Populate monthlyPayouts from trades data (actual payout transactions)
			monthlyPayouts = [];
			
			// Calculate monthly payouts from CSV data for all SFTs
			monthlyPayouts = [];
			const monthlyPayoutsMap = new Map();
			
			// Process CSV data for all SFTs to get actual payout amounts
			for (const field of ENERGY_FIELDS) {
				for (const token of field.sftTokens) {
					if (token.claims && token.claims.length > 0) {
						for (const claim of token.claims) {
							if (claim.csvLink) {
								const csvText = await fetchCsvData(claim.csvLink);
								if (csvText) {
									const parsedData = await parseCsvData(csvText);
									const trades = await getTradesForClaims(claim.orderHash, $signerAddress || '', field.name);
									
									if (trades && trades.length > 0) {
										const sortedClaimsData = await sortClaimsData(parsedData, trades, $signerAddress || '', field.name);
										
										// Process each trade to get timestamp and amount
										for (const trade of trades) {
											const timestamp = trade.tradeEvent?.transaction?.timestamp;
											if (timestamp) {
												const date = new Date(Number(timestamp) * 1000);
												const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
												
												// Calculate the payout amount for this trade
												// We'll distribute the total earned amount across all trades for this SFT
												if (sortedClaimsData?.totalEarned) {
													const totalEarnedForSft = Number(formatEther(BigInt(sortedClaimsData.totalEarned)));
													const payoutPerTrade = totalEarnedForSft / trades.length;
													
													monthlyPayoutsMap.set(monthKey, (monthlyPayoutsMap.get(monthKey) || 0) + payoutPerTrade);
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
			
			// Convert to monthlyPayouts format
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
			
			// Sort by date
			monthlyPayouts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
			
			// If no trades data, fall back to claim history
			if (monthlyPayouts.length === 0 && claimHistory.length > 0) {
				const monthlyClaims = new Map();
				
				for(const claim of claimHistory) {
					if(claim.date && claim.amount) {
						const date = new Date(claim.date);
						const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
						
						const amount = Number(claim.amount);
						monthlyClaims.set(monthKey, (monthlyClaims.get(monthKey) || 0) + amount);
					}
				}
				
				for(const [monthKey, amount] of monthlyClaims) {
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
			}
			
			// Populate tokenAllocations from holdings
			tokenAllocations = holdings.map(holding => {
				const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.totalInvested, 0);
				const allocationPercentage = totalPortfolioValue > 0 ? (holding.totalInvested / totalPortfolioValue) * 100 : 0;
				
				return {
					assetId: holding.id,
					assetName: holding.asset.assetName,
					tokenSymbol: holding.tokenSymbol,
					tokensOwned: holding.tokensOwned,
					currentValue: holding.totalInvested,
					percentageOfPortfolio: allocationPercentage
				};
			});
			
			console.log('Final holdings created:', holdings.length, holdings.map(h => ({
				name: h.name,
				totalInvested: h.totalInvested,
				totalPayoutsEarned: h.totalPayoutsEarned,
				sftAddress: h.sftAddress
			})));
			
			// Calculate portfolio stats
			// Total Invested: Sum of all deposits for all SFTs
			if (allDepositsData.length > 0) {
				totalInvested = allDepositsData.reduce((sum, deposit) => sum + Number(formatEther(deposit.amount)), 0);
			} else if (holdings.length > 0) {
				totalInvested = holdings.reduce((sum, holding) => sum + holding.totalInvested, 0);
			} else {
				totalInvested = 0;
			}
			
			// All Payouts: Sum of all payout amounts from holdings (which now include CSV data)
			if (holdings.length > 0) {
				totalPayoutsEarned = holdings.reduce((sum, holding) => sum + holding.totalPayoutsEarned, 0);
			} else {
				totalPayoutsEarned = 0;
			}
			
			// Active Assets: Total number of SFTs
			activeAssetsCount = holdings.length;
			
			// Unclaimed Payout: Sum of unclaimed amounts
			if (holdings.length > 0) {
				unclaimedPayout = holdings.reduce((sum, holding) => sum + holding.unclaimedAmount, 0);
			} else {
				unclaimedPayout = 0;
			}
			
			console.log('Portfolio stats calculated:', {
				totalInvested,
				totalPayoutsEarned,
				activeAssetsCount,
				unclaimedPayout
			});
		} else {
			console.log('Stores are empty or null:', {
				sfts: $sfts,
				sftMetadata: $sftMetadata,
				sftsLength: $sfts?.length,
				sftMetadataLength: $sftMetadata?.length
			});
		}	
		pageLoading = false;
		isLoadingData = false;
	}
	
	$: if($connected && $signerAddress){
		unflipAll();
		if($sfts && $sftMetadata){
			loadSftData();
		}
	}	
	
</script>

<svelte:head>
	<title>Portfolio - Albion</title>
	<meta name="description" content="Track your oil & gas investment portfolio performance" />
</svelte:head>

{#if (!$connected || !$signerAddress)}
	<PageLayout variant="constrained">
		<ContentSection background="white" padding="large" centered>
			<div class="flex flex-col items-center justify-center min-h-[60vh] text-center">
				<SectionTitle level="h1" size="page" center>Wallet Connection Required</SectionTitle>
				<p class="text-lg text-black opacity-80 mb-8 max-w-md">Please connect your wallet to view your portfolio.</p>
				<PrimaryButton on:click={connectWallet}>
					Connect Wallet
				</PrimaryButton>
			</div>
		</ContentSection>
	</PageLayout>
{:else if $connected && $signerAddress}
<PageLayout variant="constrained">
	<!-- Portfolio Overview Header -->
	<HeroSection 
		title="My Portfolio"
		subtitle="Track your investment portfolio performance and history"
		showBorder={true}
		showButtons={false}
		className="py-12"
	>
		<!-- Platform Stats - 3 columns on all viewports -->
		<div class="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-8 text-center max-w-6xl mx-auto mt-6">
			{#if pageLoading}
				<StatsCard
					title="Portfolio Value"
					value="--"
					subtitle="Loading..."
					size="large"
				/>
				<StatsCard
					title="Total Earned"
					value="--"
					subtitle="Loading..."
					size="large"
				/>
				<StatsCard
					title="Active Assets"
					value="--"
					subtitle="Loading..."
					size="small"
				/>
			{:else}
				<StatsCard
					title="Portfolio Value"
					value={formatCurrency(totalInvested, { compact: true })}
					subtitle="Total invested"
					size="small"
				/>
				<StatsCard
					title="Total Earned"
					value={formatCurrency(totalPayoutsEarned, { compact: true })}
					subtitle="All payouts"
					valueColor="primary"
					size="small"
				/>
				<StatsCard
					title="Active Assets"
					value={activeAssetsCount.toString()}
					subtitle="In portfolio"
					size="small"
				/>
			{/if}
		</div>
	</HeroSection>

	<!-- Portfolio Content -->
	<ContentSection background="white" padding="standard">
		<!-- Mobile: Always show overview, other tabs in expandable sections -->
		<!-- Desktop: Traditional tabs -->
		<div class="hidden lg:block">
			<div class="bg-white border border-light-gray mb-8">
				<div class="flex flex-wrap border-b border-light-gray">
					<TabButton
						active={activeTab === 'overview'}
						on:click={() => activeTab = 'overview'}
					>
						Holdings
					</TabButton>
					<TabButton
						active={activeTab === 'performance'}
						on:click={() => activeTab = 'performance'}
					>
						Performance
					</TabButton>
					<TabButton
						active={activeTab === 'allocation'}
						on:click={() => activeTab = 'allocation'}
					>
						Allocation
					</TabButton>
				</div>
			</div>
		</div>

					<!-- Mobile: Always show overview -->
		<div class="lg:hidden">
			<SectionTitle level="h3" size="subsection" className="mb-6">My Holdings</SectionTitle>
			
			<div class="space-y-4">
				{#if pageLoading}
					<div class="text-center py-8 text-black opacity-70">Loading portfolio holdings...</div>
				{:else}
					{#each holdings as holding}
						{@const flipped = $flippedCards.has(holding.id)}
						{@const payoutData = flipped ? getPayoutChartData(holding) : []}
						{console.log('Card flip state for', holding.id, ':', flipped)}
						<div class="mb-4" style="perspective: 1000px;">
							<div class="relative w-full transition-transform duration-500" style="transform-style: preserve-3d; transform: rotateY({flipped ? 180 : 0}deg); height: 320px;">
								<!-- Front of card -->
								<div class="absolute inset-0 w-full h-full" style="backface-visibility: hidden;">
									<Card hoverable showBorder>
										<CardContent paddingClass="p-4 sm:p-6 h-full flex flex-col justify-between">
											<div class="flex items-start gap-3 mb-4">
												<div class="w-12 h-12 bg-light-gray rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
													{#if holding.asset?.coverImage}
														<img src={`${PINATA_GATEWAY}/${holding.asset.coverImage}`} alt={holding.name} class="w-full h-full object-cover" />
													{:else}
														<div class="text-xl opacity-50">🛢️</div>
													{/if}
												</div>
												<div class="flex-1">
													<h4 class="font-extrabold text-black text-base mb-1">{holding.tokenSymbol}</h4>
													<div class="text-sm text-black opacity-70 mb-1">{holding.asset.assetName}</div>
													<StatusBadge
														status={holding.status}
														variant={holding.status === 'producing' ? 'available' : 'default'}
														size="small"
													/>
												</div>
												<div class="text-right">
													<div class="text-lg font-extrabold text-primary">{formatCurrency(holding.totalPayoutsEarned)}</div>
													<div class="text-xs text-black opacity-70">Total Earned</div>
												</div>
											</div>
											
											<div class="grid grid-cols-2 gap-4 mb-4">
												<div>
													<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wide mb-1">Tokens</div>
													<div class="text-sm font-extrabold text-black">{formatNumber(holding.tokensOwned)}</div>
												</div>
												<div>
													<div class="text-xs font-bold text-black opacity-70 uppercase tracking-wide mb-1">Invested</div>
													<div class="text-sm font-extrabold text-black">
														<FormattedNumber value={holding.totalInvested} type="currency" compact={holding.totalInvested >= 10000} />
													</div>
												</div>
											</div>
											
											<div class="flex gap-2">
												<SecondaryButton size="small" href="/claims" fullWidth>Claims</SecondaryButton>
												<SecondaryButton size="small" on:click={() => {
													console.log('History button clicked for holding:', holding.id);
													toggleCardFlip(holding.id);
												}} fullWidth>History</SecondaryButton>
											</div>
										</CardContent>
									</Card>
								</div>
								
								<!-- Back of card -->
								<div class="absolute inset-0 w-full h-full" style="backface-visibility: hidden; transform: rotateY(180deg);">
									<Card hoverable showBorder>
										<CardContent paddingClass="p-4 sm:p-6 h-full flex flex-col">
											<div class="flex justify-between items-start mb-4">
												<div>
													<h4 class="font-extrabold text-black text-base">{holding.name}</h4>
												</div>
												<SecondaryButton size="small" on:click={() => toggleCardFlip(holding.id)}>Back</SecondaryButton>
											</div>
											
											{#if payoutData && payoutData.length > 0}
												{@const cumulativeData = payoutData.reduce((acc: Array<{label: string; value: number}>, d, i) => {
													const prevTotal = i > 0 ? acc[i-1].value : 0;
													acc.push({ label: d.date, value: prevTotal + d.value });
													return acc;
												}, [] as Array<{label: string; value: number}>)}
												
												<div class="flex-1 space-y-4">
													<!-- Monthly Payouts Chart -->
													<div>
														<h5 class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2">Monthly Payouts</h5>
														<Chart
															data={payoutData.map(d => ({ label: d.date, value: d.value }))}
															width={300}
															height={120}
															barColor="#08bccc"
															valuePrefix="$"
															animate={true}
															showGrid={true}
														/>
													</div>
													
													<!-- Cumulative Payouts Chart -->
													<div>
														<h5 class="text-xs font-bold text-black opacity-70 uppercase tracking-wider mb-2">Cumulative Returns</h5>
														<Chart
															data={cumulativeData}
															width={300}
															height={120}
															barColor="#08bccc"
															valuePrefix="$"
															animate={true}
															showGrid={true}
															horizontalLine={{
																value: holding.totalInvested,
																label: 'Breakeven',
																color: '#283c84'
															}}
														/>
													</div>
												</div>
											{:else}
												<div class="flex-1 flex items-center justify-center text-center text-black opacity-70">
													<div>
														<div class="text-3xl mb-2">📊</div>
														<div class="text-sm">No payout history available yet</div>
													</div>
												</div>
											{/if}
										</CardContent>
									</Card>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
			
			<!-- Mobile: Collapsible Performance Section -->
			<div class="mt-8">
				<CollapsibleSection title="Performance Analysis" isOpenByDefault={false} alwaysOpenOnDesktop={false}>
					{@const recentPerformance = (() => {
						const monthsAgo = new Date();
						monthsAgo.setMonth(monthsAgo.getMonth() - 3);
						
						// Filter monthly payouts to get recent data
						return monthlyPayouts.filter(payout => {
							const payoutDate = new Date(payout.date);
							return payoutDate >= monthsAgo;
						});
					})()}
					
				<div class="grid grid-cols-2 gap-4 mb-6">
					<StatsCard
						title="Portfolio Value"
						value={formatCurrency(totalInvested)}
						subtitle="Total invested"
						size="medium"
					/>
					<StatsCard
						title="Total Earned"
						value={formatCurrency(totalPayoutsEarned)}
						subtitle="All payouts"
						size="medium"
						valueColor="primary"
					/>
					<StatsCard
						title="Active Assets"
						value={activeAssetsCount.toString()}
						subtitle="In portfolio"
						size="medium"
					/>
					<StatsCard
						title="Unclaimed"
						value={formatCurrency(unclaimedPayout)}
						subtitle="Available to claim"
						size="medium"
						valueColor="primary"
					/>
				</div>
					
					<p class="text-sm text-gray-600">Detailed performance charts and analysis available on desktop.</p>
				</CollapsibleSection>
			</div>
			
			<!-- Mobile: Collapsible Allocation Section -->
			<div class="mt-4">
				<CollapsibleSection title="Portfolio Allocation" isOpenByDefault={false} alwaysOpenOnDesktop={false}>
					<div class="space-y-3">
						{#each holdings as holding}
							{@const allocationPercentage = totalInvested > 0 ? (holding.totalInvested / totalInvested) * 100 : 0}
							<div class="flex justify-between items-center p-3 bg-light-gray rounded">
								<div>
									<div class="font-semibold text-sm">{holding.tokenSymbol}</div>
									<div class="text-xs text-gray-600">{holding.name}</div>
								</div>
								<div class="text-right">
									<div class="font-bold text-sm">{allocationPercentage.toFixed(1)}%</div>
									<div class="text-xs text-gray-600">{formatCurrency(holding.totalInvested, { compact: true })}</div>
								</div>
							</div>
						{/each}
					</div>
				</CollapsibleSection>
			</div>
		</div>
		
		<!-- Desktop: Tab content -->
		<div class="hidden lg:block p-8">
			{#if activeTab === 'overview'}
				<SectionTitle level="h3" size="subsection" className="mb-6">My Holdings</SectionTitle>
					
					<div class="space-y-3">
						{#if pageLoading}
							<div class="text-center py-12 text-black opacity-70">Loading portfolio holdings...</div>
						{:else}
							{#each holdings as holding}
								{@const flipped = $flippedCards.has(holding.id)}
								{@const payoutData = flipped ? getPayoutChartData(holding) : []}
								<div class="mb-3" style="perspective: 1000px;">
									<div class="relative w-full transition-transform duration-500" style="transform-style: preserve-3d; transform: rotateY({flipped ? 180 : 0}deg); height: 360px;">
										<!-- Front of card -->
										<div class="absolute inset-0 w-full h-full" style="backface-visibility: hidden;">
											<Card hoverable showBorder>
											<CardContent paddingClass="p-9 h-full flex flex-col justify-between">
												<div class="flex justify-between items-start mb-7">
													<div class="flex items-start gap-4">
														<div class="w-14 h-14 bg-light-gray rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
															{#if holding.asset?.coverImage}
																<img src={`${PINATA_GATEWAY}/${holding.asset.coverImage}`} alt={holding.name} class="w-full h-full object-cover" />
															{:else}
																<div class="text-2xl opacity-50">🛢️</div>
															{/if}
														</div>
														<div class="text-left">
															<h4 class="font-extrabold text-black text-lg mb-1">
																{holding.tokenSymbol}
															</h4>
															<div class="text-sm text-black opacity-70 mb-1">{holding.asset.assetName}</div>
															<div class="text-xs text-black opacity-70 mb-2">{holding.asset.location?.state}, {holding.asset.location?.country}</div>
															<StatusBadge 
																status={holding.status} 
																variant={holding.status === 'producing' ? 'available' : 'default'}
															/>
														</div>
													</div>

													<div class="flex gap-2">
														<SecondaryButton size="small" href="/claims">Claims</SecondaryButton>
														<SecondaryButton size="small" on:click={() => toggleCardFlip(holding.id)}>History</SecondaryButton>
													</div>
												</div>

										<div class="grid grid-cols-5 gap-4 mt-4">
											<!-- Tokens -->
											<div class="pr-6 flex flex-col">
												<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-4 h-10 flex items-start">Tokens</div>
															<div class="text-xl font-extrabold text-black mb-3">{formatNumber(holding.tokensOwned)}</div>
			<div class="text-sm text-black opacity-70">
				<FormattedNumber value={holding.totalInvested} type="currency" compact={holding.totalInvested >= 10000} />
			</div>
											</div>

											<!-- 	 -->
											<div class="flex flex-col">
												<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-4 h-10 flex items-start">Payouts to Date</div>
												<div class="text-xl font-extrabold text-primary mb-3">{formatCurrency(holding.totalPayoutsEarned)}</div>
												<div class="text-sm text-black opacity-70">Cumulative</div>
											</div>

											<!-- Capital Returned -->
											<div class="relative flex flex-col">
												<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-4 flex items-start gap-1 h-10">
													<span>Capital Returned</span>
													<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100"
														on:mouseenter={() => showTooltipWithDelay('capital-returned-' + holding.id)}
														on:mouseleave={hideTooltip}
														role="button"
														tabindex="0">ⓘ</span>
												</div>
												<div class="text-xl font-extrabold text-black mb-3">{formatPercentage(holding.capitalReturned / 100, { decimals: 3 })}</div>
												<div class="text-sm text-black opacity-70">To Date</div>
												{#if isTooltipVisible('capital-returned-' + holding.id)}
													<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-3 rounded text-xs z-[1000] mb-[5px] w-48 text-left leading-relaxed">
														The portion of your initial<br/>investment already recovered
													</div>
												{/if}
											</div>

											<!-- Asset Depletion -->
											<div class="relative flex flex-col">
												<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-4 flex items-start gap-1 h-10">
													<span>Est. Asset Depletion</span>
													<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-light-gray text-black text-[10px] font-bold cursor-help opacity-70 transition-opacity duration-200 hover:opacity-100"
														on:mouseenter={() => showTooltipWithDelay('depletion-' + holding.id)}
														on:mouseleave={hideTooltip}
														role="button"
														tabindex="0">ⓘ</span>
												</div>
												<div class="text-xl font-extrabold text-black mb-3">
													{holding.assetDepletion > 0 ? `${holding.assetDepletion.toFixed(1)}%` : 'TBD'}
												</div>
												<div class="text-sm text-black opacity-70">To Date</div>
												{#if isTooltipVisible('depletion-' + holding.id)}
													<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-3 rounded text-xs z-[1000] mb-[5px] w-48 text-left leading-relaxed">
														The portion of total expected<br/>oil and gas extracted so far
													</div>
												{/if}
											</div>

											<!-- Capital To be Recovered / Lifetime Profit -->
											<div class="flex flex-col">
												<div class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-4 h-10 flex items-start">
													{holding.unrecoveredCapital > 0 ? 'Capital To be Recovered' : 'Lifetime Profit'}
												</div>
												<div class="text-xl font-extrabold {holding.unrecoveredCapital > 0 ? 'text-black' : 'text-primary'} mb-3">
													{formatCurrency(holding.unrecoveredCapital > 0 ? holding.unrecoveredCapital : holding.totalPayoutsEarned - holding.totalInvested)}
												</div>
												<div class="text-sm text-black opacity-70">
													{holding.unrecoveredCapital > 0 ? 'Remaining' : 'To Date'}
												</div>
											</div>
										</div>
										</CardContent>
										</Card>
										</div>
										
										<!-- Back of card -->
										<div class="absolute inset-0 w-full h-full" style="backface-visibility: hidden; transform: rotateY(180deg);">
											<Card hoverable showBorder>
												<CardContent paddingClass="p-8 h-full flex flex-col">
												<div class="flex justify-between items-start mb-2">
													<div>
														<h4 class="font-extrabold text-black text-lg">{holding.name}</h4>
													</div>
													<SecondaryButton size="small" on:click={() => toggleCardFlip(holding.id)}>Back</SecondaryButton>
												</div>
												
												<div class="flex-1 flex gap-6">
													{#if payoutData && payoutData.length > 0}
														{@const cumulativeData = payoutData.reduce((acc: Array<{label: string; value: number}>, d, i) => {
															const prevTotal = i > 0 ? acc[i-1].value : 0;
															acc.push({ label: d.date, value: prevTotal + d.value });
															return acc;
														}, [] as Array<{label: string; value: number}>)}
														<!-- Monthly Payouts Chart -->
														<div class="flex-1">
															<h5 class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-1">Monthly Payouts</h5>
															<Chart
																data={payoutData.map(d => ({ label: d.date, value: d.value }))}
																width={400}
																height={220}
																barColor="#08bccc"
																valuePrefix="$"
																animate={true}
																showGrid={true}
															/>
														</div>
														
														<!-- Cumulative Payouts Chart -->
														<div class="flex-1">
															<h5 class="text-sm font-bold text-black opacity-70 uppercase tracking-wider mb-1">Cumulative Returns</h5>
															<Chart
																data={cumulativeData}
																width={400}
																height={220}
																barColor="#08bccc"
																valuePrefix="$"
																animate={true}
																showGrid={true}
																horizontalLine={{
																	value: holding.totalInvested,
																	label: 'Breakeven',
																	color: '#283c84'
																}}
															/>
														</div>
													{:else}
														<div class="flex-1 flex items-center justify-center text-center text-black opacity-70">
															<div>
																<div class="text-4xl mb-2">📊</div>
																<div>No payout history available yet</div>
															</div>
														</div>
													{/if}
												</div>
												</CardContent>
											</Card>
										</div>
									</div>
								</div>
							{/each}
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
							
							// Sum all payouts for this month
							monthlyPayoutsMap.set(monthKey, (monthlyPayoutsMap.get(monthKey) || 0) + payout.amount);
						});
						
						// Process deposits (mints) from deposits data - these are the investments
						if (allDepositsData.length > 0) {
							// Group deposits by month and sum amounts
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
								
								const totalInvested = holdings.reduce((sum, holding) => sum + holding.totalInvested, 0);
								monthlyMints.set(monthKey, totalInvested);
							} else {
								const currentDate = new Date();
								const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
								
								const totalInvested = holdings.reduce((sum, holding) => sum + holding.totalInvested, 0);
								monthlyMints.set(monthKey, totalInvested);
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
							
							// Update running totals
							runningCumulativeMints += monthlyMint;
							runningCumulativePayouts += monthlyPayout;
							
							// Net position: cumulative payouts minus cumulative mints
							const netPosition = runningCumulativePayouts - runningCumulativeMints;
							maxDeficit = Math.max(maxDeficit, Math.abs(netPosition));
							
							// Check for first zero crossing (house money point)
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
						
						// Calculate gross payout from claim history (actual payout amounts)
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
												value: -d.monthlyMint // Negative for mints
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
											animate={true}
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
								<!-- Tooltip icon -->
								<div 
									class="absolute top-4 right-4 w-4 h-4 rounded-full bg-light-gray text-black text-xs flex items-center justify-center cursor-help"
									on:mouseenter={() => showTooltipWithDelay('external-capital')}
									on:mouseleave={hideTooltip}
									on:focus={() => showTooltipWithDelay('external-capital')}
									on:blur={hideTooltip}
									role="button"
									tabindex="0"
									aria-label="More information about Total External Capital"
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
								<!-- Tooltip icon -->
								<div 
									class="absolute top-4 right-4 w-4 h-4 rounded-full bg-light-gray text-black text-xs flex items-center justify-center cursor-help"
									on:mouseenter={() => showTooltipWithDelay('gross-deployed')}
									on:mouseleave={hideTooltip}
									on:focus={() => showTooltipWithDelay('gross-deployed')}
									on:blur={hideTooltip}
									role="button"
									tabindex="0"
									aria-label="More information about Gross Deployed"
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
								<!-- Tooltip icon -->
								<div 
									class="absolute top-4 right-4 w-4 h-4 rounded-full bg-light-gray text-black text-xs flex items-center justify-center cursor-help"
									on:mouseenter={() => showTooltipWithDelay('gross-payout')}
									on:mouseleave={hideTooltip}
									on:focus={() => showTooltipWithDelay('gross-payout')}
									on:blur={hideTooltip}
									role="button"
									tabindex="0"
									aria-label="More information about Gross Payout"
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
								<!-- Tooltip icon -->
								<div 
									class="absolute top-4 right-4 w-4 h-4 rounded-full bg-light-gray text-black text-xs flex items-center justify-center cursor-help"
									on:mouseenter={() => showTooltipWithDelay('realised-profit')}
									on:mouseleave={hideTooltip}
									on:focus={() => showTooltipWithDelay('realised-profit')}
									on:blur={hideTooltip}
									role="button"
									tabindex="0"
									aria-label="More information about Current Net Position"
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
							<div class="bg-white border border-light-gray rounded-lg p-6 flex items-center justify-center">
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
										animate={false}
									/>
								{:else}
									<div class="text-center py-12 text-black opacity-70">
										No portfolio data available
									</div>
								{/if}
							</div>
						</div>

						<div>
							<SectionTitle level="h3" size="subsection" className="mb-6">Allocation Breakdown</SectionTitle>
							<div class="space-y-4 mb-8">
								{#each tokenAllocations as allocation}
									<div class="flex justify-between items-center pb-4 border-b border-light-gray last:border-b-0 last:pb-0">
										<div class="flex items-center gap-3">
											<div class="w-8 h-8 bg-light-gray rounded overflow-hidden flex items-center justify-center">
												<div class="text-base opacity-50">🛢️</div>
											</div>
											<div>
												<div class="font-extrabold text-black text-sm">{allocation.assetName}</div>
												<div class="text-xs text-black opacity-70">{allocation.tokenSymbol} • {allocation.tokensOwned} tokens</div>
											</div>
										</div>
										<div class="text-right">
											<div class="font-extrabold text-black text-sm">{allocation.percentageOfPortfolio.toFixed(1)}%</div>
											<div class="text-xs text-black opacity-70">{formatCurrency(allocation.currentValue)}</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
							{/if}
			</div>
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
					description="{formatCurrency(unclaimedPayout)} available"
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

<style>
	/* CSS classes removed - styles are now inline for better browser compatibility */
</style>