<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import type { Asset, Token } from '$lib/types/uiTypes';
	import {
		readContract,
		writeContract,
		waitForTransactionReceipt,
		simulateContract,
	} from '@wagmi/core';
	import { signerAddress, wagmiConfig, chainId } from 'svelte-wagmi';
	import { formatEther, formatUnits, parseUnits, type Hex } from 'viem';
	import { erc20Abi } from 'viem';
	import { onMount } from 'svelte';
	import { PrimaryButton, SecondaryButton, FormattedNumber } from '$lib/components/components';
	import { sftMetadata, sfts } from '$lib/stores';
	import { decodeSftInformation } from '$lib/decodeMetadata/helpers';
	import type { OffchainAssetReceiptVault } from '$lib/types/graphql';
	import {
		generateAssetInstanceFromSftMeta,
		generateTokenInstanceFromSft,
	} from '$lib/decodeMetadata/addSchemaToReceipts';
	import authorizerAbi from '$lib/abi/authorizer.json';
	import OffchainAssetReceiptVaultAbi from '$lib/abi/OffchainAssetReceiptVault.json';
	import { getEnergyFieldId } from '$lib/utils/energyFieldGrouping';
	import { getTokenTermsPath } from '$lib/utils/tokenTerms';
	import { getTxUrl } from '$lib/utils/explorer';

	export let isOpen = false;
	export let tokenAddress: string | null = null;
	export let assetId: string | null = null;

	const dispatch = createEventDispatcher();

	// Purchase form state
	let investmentAmount = 5000;
	let agreedToTerms = false;
	let purchasing = false;
	let purchaseSuccess = false;
	let purchaseError: string | null = null;
	let canProceed = false;
	let transactionHash: string | null = null;

	// USDC balance state
	let usdcBalance = 0;
	let loadingBalance = false;

	// Data
	let assetData: Asset | null = null;
	let tokenData: Token | null = null;
	let supply: {
		maxSupply: bigint;
		mintedSupply: bigint;
		availableSupply: bigint;
	} | null = null;
	let currentSft: OffchainAssetReceiptVault | null = null;
	let tokenTermsUrl: string | null = null;
	let paymentToken: Hex | null = null;
	let paymentTokenDecimals = 18;

	// Reactive calculations
	$: if (isOpen && (tokenAddress || assetId)) {
		loadTokenData();
	}

	$: tokenTermsUrl = tokenData ? getTokenTermsPath(tokenData.contractAddress) : null;
	$: maxInvestmentAmount = (() => {
		if (!supply) return Number.POSITIVE_INFINITY;
		const parsed = parseFloat(formatEther(supply.availableSupply));
		return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
	})();
	$: normalizedInvestmentAmount = typeof investmentAmount === 'number' && !Number.isNaN(investmentAmount) ? investmentAmount : 0;
	$: formattedUsdcAmount = `USDC ${normalizedInvestmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	$: order = {
		investment: normalizedInvestmentAmount,
		tokens: normalizedInvestmentAmount // 1:1 ratio for simplicity
	};

	$: {
		const withinSupplyLimit = Number.isFinite(maxInvestmentAmount)
			? normalizedInvestmentAmount <= maxInvestmentAmount
			: true;
		canProceed =
			agreedToTerms &&
			normalizedInvestmentAmount > 0 &&
			withinSupplyLimit &&
			!purchasing &&
			!isSoldOut();
	}

	async function loadTokenData() {
		try {
			if (tokenAddress && $sftMetadata && $sfts) {
				const sft = $sfts.find((item) =>
					item.id.toLowerCase() === tokenAddress.toLowerCase(),
				);
				if (!sft) {
					purchaseError = 'Token not found';
					return;
				}

				currentSft = sft;

				const decodedMeta = $sftMetadata
					.map((metaV1) => decodeSftInformation(metaV1))
					.filter(Boolean);

				const pinnedMetadata = decodedMeta.find(
					(meta) =>
						meta?.contractAddress?.toLowerCase() ===
						`0x000000000000000000000000${sft.id.slice(2).toLowerCase()}`,
				);

				if (!pinnedMetadata) {
					purchaseError = 'Token metadata unavailable';
					return;
				}

				const sftMaxSharesSupply = (await readContract($wagmiConfig, {
					abi: authorizerAbi,
					address: sft.activeAuthorizer?.address as Hex,
					functionName: 'maxSharesSupply',
					args: [],
				})) as bigint;

				tokenData = generateTokenInstanceFromSft(
					sft,
					pinnedMetadata,
					sftMaxSharesSupply.toString(),
				);
				assetData = generateAssetInstanceFromSftMeta(sft, pinnedMetadata);

				supply = {
					maxSupply: sftMaxSharesSupply,
					mintedSupply: BigInt(sft.totalShares),
					availableSupply:
						sftMaxSharesSupply - BigInt(sft.totalShares ?? '0'),
				};

				// Get payment token and decimals
				const paymentTokenAddress = (await readContract($wagmiConfig, {
					abi: authorizerAbi,
					address: sft.activeAuthorizer?.address as Hex,
					functionName: 'paymentToken',
					args: []
				})) as Hex;

				const paymentTokenDecimalsValue = (await readContract($wagmiConfig, {
					abi: authorizerAbi,
					address: sft.activeAuthorizer?.address as Hex,
					functionName: 'paymentTokenDecimals',
					args: []
				})) as number;

				paymentToken = paymentTokenAddress;
				paymentTokenDecimals = paymentTokenDecimalsValue;

				// Load USDC balance after getting payment token info
				await loadUsdcBalance();
			}
		} catch (error) {
			console.error('Error loading token data:', error);
			purchaseError = 'Failed to load token data';
		}
	}

	function isSoldOut(): boolean {
		return supply ? supply.availableSupply <= 0n : false;
	}

	async function loadUsdcBalance() {
		try {
			if (!$signerAddress || !paymentToken || !currentSft) {
				usdcBalance = 0;
				return;
			}

			loadingBalance = true;

			const balance = (await readContract($wagmiConfig, {
				abi: erc20Abi,
				address: paymentToken,
				functionName: 'balanceOf',
				args: [$signerAddress as Hex]
			})) as bigint;

			// Use the actual token decimals (USDC is 6, not 18)
			usdcBalance = parseFloat(formatUnits(balance, paymentTokenDecimals));
		} catch (error) {
			console.error('Error loading USDC balance:', error);
			usdcBalance = 0;
		} finally {
			loadingBalance = false;
		}
	}

	function setQuickInvestAmount(percentage: number) {
		// Calculate percentage of balance, but cap by available supply
		const percentageOfBalance = (usdcBalance * percentage) / 100;
		const maxAvailable = Number.isFinite(maxInvestmentAmount) ? maxInvestmentAmount : 0;

		investmentAmount = Math.min(percentageOfBalance, maxAvailable);
	}


	async function handlePurchase() {
		if (!canProceed) return;
		if (!currentSft || !tokenAddress) {
			purchaseError = 'Token data unavailable';
			return;
		}

		purchasing = true;
		purchaseError = null;

		try {
			const authorizerAddress = currentSft.activeAuthorizer?.address;
			if (!authorizerAddress) {
				purchaseError = 'Authorizer unavailable';
				purchasing = false;
				return;
			}

			// Get payment token and decimals
			const paymentToken = await readContract($wagmiConfig, {
				abi: authorizerAbi,
				address: authorizerAddress as Hex,
				functionName: 'paymentToken',
				args: []
			});

			const paymentTokenDecimals = await readContract($wagmiConfig, {
				abi: authorizerAbi,
				address: authorizerAddress as Hex,
				functionName: 'paymentTokenDecimals',
				args: []
			}) as number;

			// Check current allowance
			const currentAllowance = await readContract($wagmiConfig, {
				abi: erc20Abi,
				address: paymentToken as Hex,
				functionName: 'allowance',
				args: [$signerAddress as Hex, authorizerAddress as Hex]
			});

			const requiredAmount = BigInt(parseUnits(normalizedInvestmentAmount.toString(), paymentTokenDecimals));
			// Only approve if current allowance is insufficient
			if (currentAllowance < requiredAmount) {
				// Simulate approval first
				const { request: approvalRequest } = await simulateContract($wagmiConfig, {
					abi: erc20Abi,
					address: paymentToken as Hex,
					functionName: 'approve',
					args: [authorizerAddress as Hex, requiredAmount]
				});

				const approvalHash = await writeContract($wagmiConfig, approvalRequest);

				// Wait for approval transaction to be confirmed with 2 block confirmations
				await waitForTransactionReceipt($wagmiConfig, {
					hash: approvalHash,
					confirmations: 2
				});

				// Small delay to ensure RPC nodes have synced the state
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

			// Simulate deposit transaction
			const { request: depositRequest } = await simulateContract($wagmiConfig, {
				abi: OffchainAssetReceiptVaultAbi,
				address: tokenAddress as Hex,
				functionName: 'deposit',
				args: [BigInt(parseUnits(normalizedInvestmentAmount.toString(), 18)), $signerAddress as Hex, BigInt(0n), "0x"]
			});

			// Execute deposit transaction
			const depositHash = await writeContract($wagmiConfig, depositRequest);
			transactionHash = depositHash;

			purchaseSuccess = true;
			dispatch('purchaseSuccess', {
				tokenAddress,
				assetId,
				amount: normalizedInvestmentAmount,
				tokens: order.tokens
			});
			
			// Reset form after success
			setTimeout(() => {
				resetForm();
				closeWidget();
			}, 2000);
			
		} catch (error) {
			purchaseError = error instanceof Error ? error.message : 'Purchase failed';
		} finally {
			purchasing = false;
		}
	}

	function resetForm() {
		investmentAmount = 5000;
		agreedToTerms = false;
		purchasing = false;
		purchaseSuccess = false;
		purchaseError = null;
		transactionHash = null;
		assetData = null;
		tokenData = null;
		supply = null;
	}

	function closeWidget() {
		isOpen = false;
		dispatch('close');
	}

	function handleBackdropPointerDown(event: PointerEvent) {
		if (event.target === event.currentTarget) {
			closeWidget();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeWidget();
		}
	}
	
	// Tailwind class mappings
	const overlayClasses = 'fixed inset-0 bg-black/50 flex items-center justify-end z-[1000] p-8';
	const containerClasses = 'bg-white w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl';
	const headerClasses = 'flex justify-between items-center p-8 border-b border-light-gray';
	const titleClasses = 'flex-1';
	const titleRowClasses = 'flex justify-between items-center gap-4';
	const mainTitleClasses = 'text-2xl font-bold text-black m-0';
	const assetNameClasses = 'text-secondary text-sm mt-2 m-0';
	const viewDetailsClasses = 'text-black px-3 py-2 text-sm font-medium no-underline whitespace-nowrap transition-colors duration-200 hover:text-primary';
	const closeClasses = 'bg-transparent border-none text-2xl cursor-pointer text-black p-0 w-8 h-8 flex items-center justify-center rounded transition-colors duration-200 hover:bg-light-gray';
	const contentClasses = 'flex-1 p-8 overflow-y-auto min-h-0';
	const formClasses = 'flex flex-col gap-8';
	const tokenDetailsClasses = 'bg-white border border-light-gray p-6';
	const detailsGridClasses = 'grid grid-cols-1 md:grid-cols-3 gap-4';
	const detailItemClasses = 'flex flex-col gap-1';
	const detailLabelClasses = 'text-xs text-gray-500 uppercase tracking-wider';
	const detailValueClasses = 'text-lg font-bold text-secondary';
	const formSectionClasses = 'flex flex-col gap-2';
	const formLabelClasses = 'text-black text-lg font-semibold';
	const usdcBadgeClasses = 'flex items-center gap-2 text-lg font-medium text-black opacity-80';
	const usdcIconClasses = 'h-5 w-5';
	const amountInputClasses = 'p-4 border-2 border-light-gray text-lg text-left transition-colors duration-200 focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed';
	const availableTokensClasses = 'mt-2 text-sm text-secondary font-medium';
	const soldOutClasses = 'text-red-600';
	const warningNoteClasses = 'text-sm text-orange-600 bg-orange-50 p-2 mt-2';
	const orderSummaryClasses = 'border border-light-gray p-6';
	const termsCheckboxClasses = 'flex items-start gap-3 text-sm leading-relaxed cursor-pointer';
	const checkboxInputClasses = 'mt-1';
	const formActionsClasses = 'flex gap-4 mt-4';
	const successStateClasses = 'text-center p-8';
	const successIconClasses = 'w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center text-2xl mx-auto mb-4';
	const errorStateClasses = 'text-center p-8';
	const successTitleClasses = 'text-xl font-bold text-black mb-4 m-0';
	const successTextClasses = 'text-gray-600 m-0';
	const errorTitleClasses = 'text-xl font-bold text-black mb-4 m-0';
	const errorTextClasses = 'text-gray-600 mb-4 m-0';
	const tokenDetailsTitleClasses = 'text-base font-medium text-black mb-4 m-0';
	const orderSummaryTitleClasses = 'font-medium text-black mb-4 m-0';
</script>

<!-- Widget Overlay -->
{#if isOpen}
	<div class={overlayClasses} on:pointerdown={handleBackdropPointerDown} on:keydown={handleKeydown} role="dialog" aria-modal="true" tabindex="-1" transition:fade={{ duration: 200 }}>
		<div class={containerClasses} transition:fly={{ x: 500, duration: 300 }}>
			<!-- Header -->
			<div class={headerClasses}>
				<div class={titleClasses}>
					<div class={titleRowClasses}>
						<h2 class={mainTitleClasses}>
							{#if tokenData}
								{tokenData.name}
							{:else}
								Purchase Tokens
							{/if}
						</h2>
						{#if tokenData && assetData}
							<a href="/assets/{getEnergyFieldId(tokenData.contractAddress)}" class={viewDetailsClasses}>
								View Details →
							</a>
						{/if}
					</div>
					{#if assetData}
						<p class={assetNameClasses}>{assetData.name}</p>
					{/if}
				</div>
				<button class={closeClasses} on:click={closeWidget}>×</button>
			</div>

			<!-- Content -->
			<div class={contentClasses}>
				{#if purchaseSuccess}
					<!-- Success State -->
					<div class={successStateClasses}>
						<div class={successIconClasses}>✓</div>
						<h3 class={successTitleClasses}>Purchase Successful!</h3>
						<p class={successTextClasses}>You have successfully purchased <FormattedNumber value={order.tokens} type="token" /> tokens.</p>
						{#if transactionHash}
							<div class="mt-6 p-4 bg-light-gray rounded">
								<p class="text-sm text-gray-600 mb-2">Transaction Hash:</p>
								<p class="text-xs font-mono text-black break-all mb-3">{transactionHash}</p>
								<a
									href={getTxUrl(transactionHash, $chainId)}
									target="_blank"
									rel="noopener noreferrer"
									class="text-primary hover:text-secondary font-medium text-sm"
								>
									View Transaction →
								</a>
							</div>
						{/if}
					</div>
				{:else if purchaseError}
					<!-- Error State -->
					<div class={errorStateClasses}>
						<h3 class={errorTitleClasses}>Purchase Failed</h3>
						<p class={errorTextClasses}>{purchaseError}</p>
						<SecondaryButton on:click={() => purchaseError = null}>
							Try Again
						</SecondaryButton>
					</div>
				{:else}
					<!-- Purchase Form -->
					<div class={formClasses}>
						<!-- Token Details -->
						{#if tokenData}
							<div class={tokenDetailsClasses}>
								<h4 class={tokenDetailsTitleClasses}>Token Details</h4>
								<div class={detailsGridClasses}>
									<div class={detailItemClasses}>
										<span class={detailLabelClasses}>Share of Asset</span>
										<span class={detailValueClasses}>{tokenData.sharePercentage || 0}%</span>
									</div>
									<div class={detailItemClasses}>
										<span class={detailLabelClasses}>Maximum Supply</span>
										<span class={detailValueClasses}>
											<FormattedNumber 
												value={formatEther(supply?.maxSupply ?? 0n)} 
												type="token"
											/>
										</span>
									</div>
									<div class={detailItemClasses}>
										<span class={detailLabelClasses}>Current Supply</span>
										<span class={detailValueClasses}>
											<FormattedNumber
												value={formatEther(supply?.mintedSupply ?? 0n)}
												type="token"
											/>
										</span>
									</div>
								</div>
							</div>
						{/if}

						<!-- Available for Purchase -->
						{#if tokenData}
							<div class="bg-white border-b-2 border-light-gray py-4 px-0">
								{#if isSoldOut()}
									<span class="text-base font-bold text-red-600">Sold Out</span>
								{:else}
									<span class="text-base font-bold text-black">
										Available: {parseFloat(formatEther(supply?.availableSupply ?? 0n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tokens
									</span>
								{/if}
							</div>
						{/if}

						<!-- Investment Amount -->
						<div class={formSectionClasses}>
							<div class="flex items-baseline justify-between gap-3">
								<label class={formLabelClasses} for="amount">Investment Amount</label>
								<span class={usdcBadgeClasses}>
									With
									<img src="/images/USDC.png" alt="USDC" class={usdcIconClasses} loading="lazy" />
									On
									<img src="/assets/BASE.svg" alt="Base" class={usdcIconClasses} loading="lazy" />
									Base
								</span>
							</div>
							<input 
								id="amount"
								type="number" 
								bind:value={investmentAmount}
								min={0.01}
								step={0.01}
								inputmode="decimal"
								max={Number.isFinite(maxInvestmentAmount) ? maxInvestmentAmount : undefined}
								class={amountInputClasses}
								disabled={isSoldOut()}
							/>

							<!-- USDC Balance -->
							<div class="mt-3 mb-4">
								<div class="text-sm text-secondary font-medium">
									{#if loadingBalance}
										Loading balance...
									{:else}
										Your Base USDC Balance: <span class="font-bold">{usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> USDC
									{/if}
								</div>
							</div>

							<!-- Quick Invest Buttons -->
							{#if !isSoldOut() && usdcBalance > 0}
								<div class="grid grid-cols-4 gap-2 mb-4">
									<button
										type="button"
										on:click={() => setQuickInvestAmount(25)}
										class="text-xs font-medium py-2 px-2 border border-light-gray rounded hover:bg-light-gray transition-colors duration-200"
										disabled={isSoldOut()}
									>
										25%
									</button>
									<button
										type="button"
										on:click={() => setQuickInvestAmount(50)}
										class="text-xs font-medium py-2 px-2 border border-light-gray rounded hover:bg-light-gray transition-colors duration-200"
										disabled={isSoldOut()}
									>
										50%
									</button>
									<button
										type="button"
										on:click={() => setQuickInvestAmount(75)}
										class="text-xs font-medium py-2 px-2 border border-light-gray rounded hover:bg-light-gray transition-colors duration-200"
										disabled={isSoldOut()}
									>
										75%
									</button>
									<button
										type="button"
										on:click={() => setQuickInvestAmount(100)}
										class="text-xs font-medium py-2 px-2 border border-light-gray rounded hover:bg-light-gray transition-colors duration-200"
										disabled={isSoldOut()}
									>
										Max
									</button>
								</div>
							{/if}
							{#if !isSoldOut() && Number.isFinite(maxInvestmentAmount) && normalizedInvestmentAmount > maxInvestmentAmount}
								<div class={warningNoteClasses}>
									Investment amount exceeds available supply.
								</div>
							{/if}
						</div>

						<!-- Order Summary -->
						<div class={orderSummaryClasses}>
							<h4 class={orderSummaryTitleClasses}>Investment Amount</h4>
							<div class="text-left">
								<span class="text-2xl font-extrabold text-black">{formattedUsdcAmount}</span>
							</div>
						</div>

						<!-- Terms Agreement -->
						<div class={formSectionClasses}>
							<label class={termsCheckboxClasses}>
								<input type="checkbox" bind:checked={agreedToTerms} class={checkboxInputClasses} />
								<span>
									I agree to the
									{#if tokenTermsUrl}
										<a href={tokenTermsUrl} target="_blank" rel="noopener noreferrer" class="text-secondary font-semibold no-underline hover:text-primary">
											terms and conditions
										</a>
									{:else}
										terms and conditions
									{/if}
									and understand the risks involved in this investment.
								</span>
							</label>
						</div>

						<!-- Action Buttons -->
						<div class={formActionsClasses}>
							<SecondaryButton on:click={closeWidget}>
								Cancel
							</SecondaryButton>
			<PrimaryButton 
				on:click={handlePurchase}
				disabled={!canProceed}
						>
								{#if isSoldOut()}
									Sold Out
								{:else if purchasing}
									Processing...
								{:else}
									Buy Now
								{/if}
							</PrimaryButton>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
