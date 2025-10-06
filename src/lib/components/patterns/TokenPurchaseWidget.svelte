<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import type { Asset, Token } from '$lib/types/uiTypes';
	import { readContract, writeContract, waitForTransactionReceipt, simulateContract } from '@wagmi/core';
	import { signerAddress, wagmiConfig } from 'svelte-wagmi';
	import { formatEther, parseUnits, type Hex } from 'viem';
	import {erc20Abi} from 'viem';
	import { PrimaryButton, SecondaryButton, FormattedNumber } from '$lib/components/components';
    import { sftMetadata, sfts } from '$lib/stores';
    import { decodeSftInformation } from '$lib/decodeMetadata/helpers';
    import type { OffchainAssetReceiptVault } from '$lib/types/graphql';
    import { generateAssetInstanceFromSftMeta, generateTokenInstanceFromSft } from '$lib/decodeMetadata/addSchemaToReceipts';
	import authorizerAbi from '$lib/abi/authorizer.json';
	import OffchainAssetReceiptVaultAbi from '$lib/abi/OffchainAssetReceiptVault.json';
    import { getEnergyFieldId } from '$lib/utils/energyFieldGrouping';
    import { getTokenTermsPath } from '$lib/utils/tokenTerms';

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

	// Data
	let assetData: Asset | null = null;
	let tokenData: Token | null = null;
let supply: any = null;
let currentSft: OffchainAssetReceiptVault;
let tokenTermsUrl: string | null = null;

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

	$: canProceed = () => {
		const withinSupplyLimit = Number.isFinite(maxInvestmentAmount) ? normalizedInvestmentAmount <= maxInvestmentAmount : true;
		return agreedToTerms && 
			   normalizedInvestmentAmount > 0 &&
			   withinSupplyLimit &&
			   !purchasing &&
			   !isSoldOut();
	};

	async function loadTokenData() {
		try {
			if (tokenAddress && $sftMetadata && $sfts) {
				const sft = $sfts.find(sft => sft.id.toLocaleLowerCase() === tokenAddress.toLocaleLowerCase());
				const deocdedMeta = $sftMetadata.map((metaV1) => decodeSftInformation(metaV1));

				const pinnedMetadata: any = deocdedMeta.find(
					(meta) => meta?.contractAddress?.toLowerCase() === `0x000000000000000000000000${sft?.id.slice(2).toLowerCase()}`
				);

				if(sft && pinnedMetadata){
					currentSft = sft;

					const sftMaxSharesSupply = await readContract($wagmiConfig, {
						abi: authorizerAbi,
						address: sft.activeAuthorizer?.address as Hex,
						functionName: 'maxSharesSupply',
						args: []
					}) as bigint;

					tokenData = generateTokenInstanceFromSft(sft, pinnedMetadata, sftMaxSharesSupply.toString());
					assetData = generateAssetInstanceFromSftMeta(sft, pinnedMetadata);


					supply = {
						maxSupply: sftMaxSharesSupply,
						mintedSupply: BigInt(sft.totalShares),
						availableSupply: sftMaxSharesSupply - BigInt(sft.totalShares)
					};
				}
			}
		} catch (error) {
			console.error('Error loading token data:', error);
			purchaseError = 'Failed to load token data';
		}
	}

	function isSoldOut(): boolean {
		return supply ? supply.availableSupply <= 0 : false;
	}


	async function handlePurchase() {
		if (!canProceed()) return;

		purchasing = true;
		purchaseError = null;

		try {
			// Get payment token and decimals
			const paymentToken = await readContract($wagmiConfig, {
				abi: authorizerAbi,
				address: currentSft.activeAuthorizer?.address as Hex,
				functionName: 'paymentToken',
				args: []
			});

			const paymentTokenDecimals = await readContract($wagmiConfig, {
				abi: authorizerAbi,
				address: currentSft.activeAuthorizer?.address as Hex,
				functionName: 'paymentTokenDecimals',
				args: []
			}) as number;

			// Check current allowance
			const currentAllowance = await readContract($wagmiConfig, {
				abi: erc20Abi,
				address: paymentToken as Hex,
				functionName: 'allowance',
				args: [$signerAddress as Hex, currentSft.activeAuthorizer?.address as Hex]
			});

			const requiredAmount = BigInt(parseUnits(normalizedInvestmentAmount.toString(), paymentTokenDecimals));
			// Only approve if current allowance is insufficient
			if (currentAllowance < requiredAmount) {
				// Simulate approval first
				const { request: approvalRequest } = await simulateContract($wagmiConfig, {
					abi: erc20Abi,
					address: paymentToken as Hex,
					functionName: 'approve',
					args: [currentSft.activeAuthorizer?.address as Hex, requiredAmount]
				});

				const approvalHash = await writeContract($wagmiConfig, approvalRequest);
				
				// Wait for approval transaction to be confirmed
				await waitForTransactionReceipt($wagmiConfig, {
					hash: approvalHash
				});
			}

			// Simulate deposit transaction
			const { request: depositRequest } = await simulateContract($wagmiConfig, {
				abi: OffchainAssetReceiptVaultAbi,
				address: tokenAddress as Hex,
				functionName: 'deposit',
				args: [BigInt(parseUnits(normalizedInvestmentAmount.toString(), 18)), $signerAddress as Hex, BigInt(0n), "0x"]
			});

			// Execute deposit transaction
			await writeContract($wagmiConfig, depositRequest);

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
		assetData = null;
		tokenData = null;
		supply = null;
	}

	function closeWidget() {
		isOpen = false;
		dispatch('close');
	}

	function handleBackdropClick(event: MouseEvent) {
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
	$: overlayClasses = 'fixed inset-0 bg-black/50 flex items-center justify-end z-[1000] p-8';
	$: containerClasses = 'bg-white w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl';
	$: headerClasses = 'flex justify-between items-center p-8 border-b border-light-gray';
	$: titleClasses = 'flex-1';
	$: titleRowClasses = 'flex justify-between items-center gap-4';
	$: mainTitleClasses = 'text-2xl font-bold text-black m-0';
	$: assetNameClasses = 'text-secondary text-sm mt-2 m-0';
	$: viewDetailsClasses = 'text-black px-3 py-2 text-sm font-medium no-underline whitespace-nowrap transition-colors duration-200 hover:text-primary';
	$: closeClasses = 'bg-transparent border-none text-2xl cursor-pointer text-black p-0 w-8 h-8 flex items-center justify-center rounded transition-colors duration-200 hover:bg-light-gray';
	$: contentClasses = 'flex-1 p-8 overflow-y-auto min-h-0';
	$: formClasses = 'flex flex-col gap-8';
	$: tokenDetailsClasses = 'bg-white border border-light-gray p-6';
	$: detailsGridClasses = 'grid grid-cols-1 md:grid-cols-3 gap-4';
	$: detailItemClasses = 'flex flex-col gap-1';
	$: detailLabelClasses = 'text-xs text-gray-500 uppercase tracking-wider';
	$: detailValueClasses = 'text-lg font-bold text-secondary';
	$: formSectionClasses = 'flex flex-col gap-2';
	$: formLabelClasses = 'text-black text-lg font-semibold';
	$: usdcBadgeClasses = 'flex items-center gap-2 text-lg font-medium text-black opacity-80';
	$: usdcIconClasses = 'h-5 w-5';
	$: amountInputClasses = 'p-4 border-2 border-light-gray text-lg text-left transition-colors duration-200 focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed';
	$: availableTokensClasses = 'mt-2 text-sm text-secondary font-medium';
	$: soldOutClasses = 'text-red-600';
	$: warningNoteClasses = 'text-sm text-orange-600 bg-orange-50 p-2 mt-2';
	$: orderSummaryClasses = 'border border-light-gray p-6';
	$: summaryDetailsClasses = 'flex flex-col gap-3';
	$: summaryRowClasses = 'flex justify-between items-center';
	$: summaryTotalClasses = 'flex justify-between items-center pt-3 border-t border-light-gray font-medium';
	$: strikethroughClasses = 'line-through text-gray-500';
	$: freeTextClasses = 'text-primary font-medium';
	$: termsCheckboxClasses = 'flex items-start gap-3 text-sm leading-relaxed cursor-pointer';
	$: checkboxInputClasses = 'mt-1';
	$: formActionsClasses = 'flex gap-4 mt-4';
	$: successStateClasses = 'text-center p-8';
	$: successIconClasses = 'w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center text-2xl mx-auto mb-4';
	$: errorStateClasses = 'text-center p-8';
	$: successTitleClasses = 'text-xl font-bold text-black mb-4 m-0';
	$: successTextClasses = 'text-gray-600 m-0';
	$: errorTitleClasses = 'text-xl font-bold text-black mb-4 m-0';
	$: errorTextClasses = 'text-gray-600 mb-4 m-0';
	$: tokenDetailsTitleClasses = 'text-base font-medium text-black mb-4 m-0';
	$: orderSummaryTitleClasses = 'font-medium text-black mb-4 m-0';
</script>

<!-- Widget Overlay -->
{#if isOpen}
	<div class={overlayClasses} on:click={handleBackdropClick} on:keydown={handleKeydown} role="dialog" aria-modal="true" tabindex="-1" transition:fade={{ duration: 200 }}>
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
												value={formatEther((supply?.maxSupply || 0))} 
												type="token"
											/>
										</span>
									</div>
									<div class={detailItemClasses}>
										<span class={detailLabelClasses}>Current Supply</span>
										<span class={detailValueClasses}>
											<FormattedNumber 
												value={formatEther((supply?.mintedSupply || 0))} 
												type="token"
											/>
										</span>
									</div>
								</div>
							</div>
						{/if}

						<!-- Investment Amount -->
						<div class={formSectionClasses}>
							<div class="flex items-baseline justify-between gap-3">
								<label class={formLabelClasses} for="amount">Investment Amount</label>
								<span class={usdcBadgeClasses}>
									With
									<img src="/assets/usdc.svg" alt="USDC" class={usdcIconClasses} loading="lazy" />
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
							<div class={availableTokensClasses}>
								{#if isSoldOut()}
									<span class={soldOutClasses}>Sold Out</span>
								{:else}
									<span>Available: <FormattedNumber value={formatEther(supply?.availableSupply || BigInt(0))} type="number" compact={false} /> tokens</span>
								{/if}
							</div>
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
							disabled={!canProceed()}
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
