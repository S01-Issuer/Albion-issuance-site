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
	import { addTokenToWallet } from '$lib/utils/walletUtils';

	export let isOpen = false;
	export let tokenAddress: string | null = null;
	export let assetId: string | null = null;

	const dispatch = createEventDispatcher();

	// Transaction status constants
	const TxStatus = {
		IDLE: 'idle',
		CHECKING_ALLOWANCE: 'checking_allowance',
		PENDING_APPROVAL: 'pending_approval',
		PENDING_DEPOSIT: 'pending_deposit',
		CONFIRMING: 'confirming',
		SUCCESS: 'success',
		ERROR: 'error'
	} as const;

	type TxStatusType = typeof TxStatus[keyof typeof TxStatus];

	// Purchase form state
	let investmentAmount = 5000;
	let agreedToTerms = false;
	let txStatus: TxStatusType = TxStatus.IDLE;
	let purchaseError: string | null = null;
	let canProceed = false;
	let transactionHash: string | null = null;
	let confirmedTokenAmount: number = 0;
	let confirmedUsdcAmount: number = 0;

	// Derived states
	$: purchasing = txStatus !== TxStatus.IDLE && txStatus !== TxStatus.SUCCESS && txStatus !== TxStatus.ERROR;
	$: purchaseSuccess = txStatus === TxStatus.SUCCESS;

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

	// Retry helper for RPC calls with exponential backoff
	async function retryRpcCall<T>(
		fn: () => Promise<T>,
		maxRetries: number = 3,
		baseDelay: number = 1000
	): Promise<T> {
		let lastError: Error | unknown;
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error;
				const errorMessage = error instanceof Error ? error.message : String(error);
				// Check if it's a rate limit error (429)
				if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
					const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
					console.warn(`RPC rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
					await new Promise(resolve => setTimeout(resolve, delay));
				} else {
					// For non-rate-limit errors, throw immediately
					throw error;
				}
			}
		}
		throw lastError;
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

				// Fetch all authorizer data in parallel with retry
				const authorizerAddr = sft.activeAuthorizer?.address as Hex;
				const [sftMaxSharesSupply, paymentTokenAddress, paymentTokenDecimalsValue] = await Promise.all([
					retryRpcCall(() => readContract($wagmiConfig, {
						abi: authorizerAbi,
						address: authorizerAddr,
						functionName: 'maxSharesSupply',
						args: [],
					})) as Promise<bigint>,
					retryRpcCall(() => readContract($wagmiConfig, {
						abi: authorizerAbi,
						address: authorizerAddr,
						functionName: 'paymentToken',
						args: []
					})) as Promise<Hex>,
					retryRpcCall(() => readContract($wagmiConfig, {
						abi: authorizerAbi,
						address: authorizerAddr,
						functionName: 'paymentTokenDecimals',
						args: []
					})) as Promise<number>
				]);

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

			const balance = await retryRpcCall(() => readContract($wagmiConfig, {
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

		txStatus = TxStatus.CHECKING_ALLOWANCE;
		purchaseError = null;

		try {
			const authorizerAddress = currentSft.activeAuthorizer?.address;
			if (!authorizerAddress) {
				purchaseError = 'Authorizer unavailable';
				txStatus = TxStatus.ERROR;
				return;
			}

			// Use already-fetched payment token info (don't re-fetch)
			if (!paymentToken || !paymentTokenDecimals) {
				purchaseError = 'Payment token info not loaded';
				txStatus = TxStatus.ERROR;
				return;
			}

			// Check current allowance with retry
			const currentAllowance = await retryRpcCall(() => readContract($wagmiConfig, {
				abi: erc20Abi,
				address: paymentToken,
				functionName: 'allowance',
				args: [$signerAddress as Hex, authorizerAddress as Hex]
			}));

			const requiredAmount = BigInt(parseUnits(normalizedInvestmentAmount.toString(), paymentTokenDecimals));

			// Only approve if current allowance is insufficient
			if (currentAllowance < requiredAmount) {
				txStatus = TxStatus.PENDING_APPROVAL;

				// Simulate approval first with retry
				const { request: approvalRequest } = await retryRpcCall(() => simulateContract($wagmiConfig, {
					abi: erc20Abi,
					address: paymentToken,
					functionName: 'approve',
					args: [authorizerAddress as Hex, requiredAmount]
				}));

				const approvalHash = await writeContract($wagmiConfig, approvalRequest);

				// Wait for approval transaction to be confirmed with 2 block confirmations
				await waitForTransactionReceipt($wagmiConfig, {
					hash: approvalHash,
					confirmations: 2
				});

				// Small delay to ensure RPC nodes have synced the state
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

			txStatus = TxStatus.PENDING_DEPOSIT;

			// Simulate deposit transaction with retry
			const { request: depositRequest } = await retryRpcCall(() => simulateContract($wagmiConfig, {
				abi: OffchainAssetReceiptVaultAbi,
				address: tokenAddress as Hex,
				functionName: 'deposit',
				args: [BigInt(parseUnits(normalizedInvestmentAmount.toString(), 18)), $signerAddress as Hex, BigInt(0n), "0x"]
			}));

			// Execute deposit transaction
			const depositHash = await writeContract($wagmiConfig, depositRequest);
			transactionHash = depositHash;

			txStatus = TxStatus.CONFIRMING;

			// Wait for transaction to be confirmed on chain
			await waitForTransactionReceipt($wagmiConfig, {
				hash: depositHash,
				confirmations: 2
			});

			// Store confirmed amounts for display
			confirmedTokenAmount = normalizedInvestmentAmount;
			confirmedUsdcAmount = normalizedInvestmentAmount;

			txStatus = TxStatus.SUCCESS;

			dispatch('purchaseSuccess', {
				tokenAddress,
				assetId,
				amount: normalizedInvestmentAmount,
				tokens: order.tokens
			});

		} catch (error) {
			purchaseError = error instanceof Error ? error.message : 'Purchase failed';
			txStatus = TxStatus.ERROR;
		}
	}

	function resetForm() {
		investmentAmount = 5000;
		agreedToTerms = false;
		txStatus = TxStatus.IDLE;
		purchaseError = null;
		transactionHash = null;
		confirmedTokenAmount = 0;
		confirmedUsdcAmount = 0;
		assetData = null;
		tokenData = null;
		supply = null;
	}

	function getStatusMessage(): string {
		switch (txStatus) {
			case TxStatus.CHECKING_ALLOWANCE:
				return 'Checking allowance...';
			case TxStatus.PENDING_APPROVAL:
				return 'Awaiting approval confirmation...';
			case TxStatus.PENDING_DEPOSIT:
				return 'Awaiting wallet confirmation...';
			case TxStatus.CONFIRMING:
				return 'Confirming transaction...';
			default:
				return '';
		}
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

	async function handleAddToWallet() {
		if (!tokenData) return;

		const success = await addTokenToWallet({
			address: tokenData.contractAddress,
			symbol: tokenData.symbol,
			decimals: 18
		});

		if (success) {
			alert('Token is now tracked in your wallet!');
		}
	}
	
	// Tailwind class mappings
	const overlayClasses = 'fixed inset-0 bg-black/50 flex items-center justify-end z-[1000] p-8';
	const confirmationOverlayClasses = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[1001] p-8';
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
								<!-- Track in Wallet link -->
								<button
									class="mt-4 inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors duration-200"
									on:click={handleAddToWallet}
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
										<path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
										<path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"/>
									</svg>
									Track in Wallet
								</button>
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
						<div class="flex gap-3 mt-4">
							<SecondaryButton on:click={closeWidget}>
								Cancel
							</SecondaryButton>
							<PrimaryButton
								on:click={handlePurchase}
								disabled={!canProceed}
								fullWidth
							>
								{#if isSoldOut()}
									Sold Out
								{:else}
									Buy Now
								{/if}
							</PrimaryButton>
						</div>
					</div>
			</div>
		</div>
	</div>
{/if}

<!-- Separate Transaction Status Modal (centered) -->
{#if purchasing || purchaseSuccess || purchaseError}
	<div class={confirmationOverlayClasses} role="dialog" aria-modal="true" transition:fade={{ duration: 200 }}>
		<div class="bg-white w-full max-w-sm p-8 shadow-2xl" transition:fly={{ y: 20, duration: 200 }}>
			{#if purchasing}
				<!-- Transaction Pending State -->
				<div class="text-center">
					<div class="w-16 h-16 mx-auto mb-6 flex items-center justify-center">
						<svg class="animate-spin h-12 w-12 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
					</div>
					<h3 class="text-xl font-bold text-black mb-4">{getStatusMessage()}</h3>
					<p class="text-gray-600 text-sm">Please confirm in your wallet and wait for the transaction to be processed.</p>
				</div>
			{:else if purchaseSuccess}
				<!-- Success State -->
				<div class="text-center">
					<div class={successIconClasses}>✓</div>
					<h3 class={successTitleClasses}>Purchase Confirmed!</h3>

					<!-- Purchase Summary -->
					<div class="mt-6 p-4 bg-light-gray text-left">
						<p class="text-xs uppercase tracking-wider text-gray-500 mb-3">Purchase Summary</p>
						<div class="flex justify-between mb-2">
							<span class="text-gray-600">Tokens Purchased</span>
							<span class="font-bold text-black"><FormattedNumber value={confirmedTokenAmount} type="token" /> {tokenData?.symbol || 'tokens'}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">Amount Paid</span>
							<span class="font-bold text-black">{confirmedUsdcAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC</span>
						</div>
					</div>

					{#if transactionHash}
						<div class="mt-4 p-4 bg-light-gray text-left">
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
					<button
						class="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-secondary bg-white border border-light-gray hover:bg-light-gray hover:border-secondary transition-colors duration-200"
						on:click={handleAddToWallet}
						title="Track token in wallet"
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
							<path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
							<path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"/>
						</svg>
						Track in Wallet
					</button>
					<SecondaryButton on:click={closeWidget} fullWidth className="mt-4">
						Close
					</SecondaryButton>
				</div>
			{:else if purchaseError}
				<!-- Error State -->
				<div class="text-center">
					<div class="w-16 h-16 bg-red-500 text-white rounded-full flex items-center justify-center text-2xl mx-auto mb-4">✕</div>
					<h3 class={errorTitleClasses}>Purchase Failed</h3>
					<p class={errorTextClasses}>{purchaseError}</p>
					<SecondaryButton on:click={() => { purchaseError = null; txStatus = TxStatus.IDLE; }}>
						Try Again
					</SecondaryButton>
				</div>
			{/if}
		</div>
	</div>
{/if}
