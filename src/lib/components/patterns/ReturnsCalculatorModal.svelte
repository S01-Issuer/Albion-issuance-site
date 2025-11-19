<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onMount, afterUpdate } from 'svelte';
	import type { TokenMetadata } from '$lib/types/MetaboardTypes';
	import { PrimaryButton, SecondaryButton } from '$lib/components/components';
	import {
		calculateMonthlyTokenCashflows,
		calculateMonthlyAssetCashflows,
		calculateNPV,
		calculateIRR,
		calculatePaybackPeriod,
		calculateLifetimeIRR,
		getLifetimeCashflows,
	} from '$lib/utils/returnsCalculatorHelpers';
	import FormattedNumber from '$lib/components/components/FormattedNumber.svelte';
	import { Chart, registerables } from 'chart.js';

	Chart.register(...registerables);

	// Props
	export let isOpen = false;
	export let token: TokenMetadata | null = null;
	export let mode: 'token' | 'asset' = 'token';
	export let onClose: () => void = () => {};
	export let mintedSupply: number = 0; // Minted supply for normalizing cashflows per token

	// Constants
	const mintPrice = 1; // Price per token in USD (may be configurable in future)

	// User inputs
	let oilPrice = 65;
	let discountRate = 10;
	let showAssetData = false; // Toggle between token and asset mode data view

	// Token Mode Calculated values - Remaining (from current month)
	let monthlyTokenCashflows: Array<{ month: string; cashflow: number }> = [];
	let remainingNPV = 0;
	let remainingIRR = 0;
	let remainingPayback = Infinity;
	let remainingAPR = 0;

	// Token Mode Calculated values - Lifetime (from cashflow start)
	let lifetimeIRR = 0;
	let lifetimeNPV = 0;
	let lifetimePayback = Infinity;
	let lifetimeAPR = 0;

	// Asset Mode Calculated values
	let monthlyAssetCashflows: Array<{ month: string; projected: number; actual: number }> = [];
	let totalProjectedAsset = 0;
	let totalActualAsset = 0;

	// Chart.js instances
	let tokenChart: Chart | null = null;
	let assetChart: Chart | null = null;
	let tokenChartCanvas: HTMLCanvasElement;
	let assetChartCanvas: HTMLCanvasElement;

	// Reactive calculations
	$: if (token && isOpen) {
		updateCalculations();
	}

	// Update when user changes inputs or mode - trigger on any input change
	$: if (token) {
		oilPrice, discountRate, mode;
		updateCalculations();
	}

	function updateCalculations() {
		if (!token) return;

		try {
			if (mode === 'token') {
				// Token Mode Calculations - Remaining cashflows
				monthlyTokenCashflows = calculateMonthlyTokenCashflows(token, oilPrice, mintedSupply);

				if (monthlyTokenCashflows.length > 0) {
					const cashflows = monthlyTokenCashflows.map((m) => m.cashflow);

					// Calculate remaining NPV using monthly discount rate
					const monthlyDiscountRate = Math.pow(1 + discountRate / 100, 1 / 12) - 1;
					remainingNPV = calculateNPV(cashflows, monthlyDiscountRate);

					// Calculate remaining IRR (returns monthly rate as decimal)
					const monthlyIRR = calculateIRR(cashflows);
					// Annualize: (1 + monthlyRate)^12 - 1, then convert to percentage
					remainingIRR = monthlyIRR > -0.99 ? (Math.pow(1 + monthlyIRR, 12) - 1) * 100 : -99;

					// Calculate remaining payback period in months
					remainingPayback = calculatePaybackPeriod(cashflows);

					// Calculate remaining APR: (Sum_all_cashflows + mintPrice)^(12/count_periods) - 1
					// Include the initial -mintPrice investment in the sum
					const sumAllCashflows = cashflows.reduce((sum, cf) => sum + cf, 0);
					const countPeriods = cashflows.length - 1; // Number of periods (excluding initial investment)
					if (countPeriods > 0 && sumAllCashflows > -mintPrice) {
						remainingAPR = (Math.pow(sumAllCashflows + mintPrice, 12 / countPeriods) - 1) * 100;
					} else {
						remainingAPR = -99;
					}
				}

				// Lifetime calculations
				lifetimeIRR = calculateLifetimeIRR(token, oilPrice, mintedSupply);

				// Calculate lifetime cashflows for NPV, Payback, and APR
				const lifetimeCashflows = getLifetimeCashflows(token, oilPrice, mintedSupply);

				if (lifetimeCashflows.length > 0) {
					// Calculate lifetime NPV using monthly discount rate
					const monthlyDiscountRate = Math.pow(1 + discountRate / 100, 1 / 12) - 1;
					lifetimeNPV = calculateNPV(lifetimeCashflows, monthlyDiscountRate);

					// Calculate lifetime payback period
					lifetimePayback = calculatePaybackPeriod(lifetimeCashflows);

					// Calculate lifetime APR: (Sum_all_cashflows + mintPrice)^(12/count_periods) - 1
					// Include the initial -mintPrice investment in the sum
					const sumAllCashflows = lifetimeCashflows.reduce((sum, cf) => sum + cf, 0);
					const countPeriods = lifetimeCashflows.length - 1; // Number of periods (excluding initial investment)
					if (countPeriods > 0 && sumAllCashflows > -mintPrice) {
						lifetimeAPR = (Math.pow(sumAllCashflows + mintPrice, 12 / countPeriods) - 1) * 100;
					} else {
						lifetimeAPR = -99;
					}
				}
			} else {
				// Asset Mode Calculations
				monthlyAssetCashflows = calculateMonthlyAssetCashflows(token, oilPrice);

				if (monthlyAssetCashflows.length > 0) {
					totalProjectedAsset = monthlyAssetCashflows.reduce((sum, m) => sum + m.projected, 0);
					totalActualAsset = monthlyAssetCashflows.reduce((sum, m) => sum + m.actual, 0);
				}
			}
		} catch (error) {
			console.error('Error in returns calculation:', error);
		}
	}

	function createTokenChart() {
		if (!tokenChartCanvas || monthlyTokenCashflows.length === 0) return;

		// Destroy existing chart
		if (tokenChart) {
			tokenChart.destroy();
		}

		const displayData = monthlyTokenCashflows.slice(0, 24);

		// Calculate cumulative returns
		let cumulative = 0;
		const cumulativeData = displayData.map(d => {
			cumulative += d.cashflow;
			return cumulative;
		});

		const ctx = tokenChartCanvas.getContext('2d');
		if (!ctx) return;

		tokenChart = new Chart(ctx, {
			type: 'bar',
			data: {
				labels: displayData.map((d, i) => i === 0 ? 'Today' : d.month),
				datasets: [
					{
						type: 'bar',
						label: 'Monthly Cashflow (USDC)',
						data: displayData.map(d => d.cashflow),
						backgroundColor: '#08bccc',
						borderColor: '#08bccc',
						borderWidth: 0,
						yAxisID: 'y',
					},
					{
						type: 'line',
						label: 'Cumulative Return (USDC)',
						data: cumulativeData,
						borderColor: '#283c84',
						backgroundColor: '#283c84',
						borderWidth: 2,
						pointRadius: 3,
						pointHoverRadius: 5,
						fill: false,
						yAxisID: 'y',
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					mode: 'index',
					intersect: false,
				},
				plugins: {
					legend: {
						display: true,
						position: 'bottom',
					},
					tooltip: {
						callbacks: {
							label: function(context) {
								let label = context.dataset.label || '';
								if (label) {
									label += ': ';
								}
								if (context.parsed.y !== null) {
									label += 'US$' + context.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
								}
								return label;
							}
						}
					}
				},
				scales: {
					y: {
						beginAtZero: true,
						ticks: {
							callback: function(value) {
								return 'US$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
							}
						}
					}
				}
			}
		});
	}

	function createAssetChart() {
		if (!assetChartCanvas || monthlyAssetCashflows.length === 0) return;

		// Destroy existing chart
		if (assetChart) {
			assetChart.destroy();
		}

		const displayData = monthlyAssetCashflows.slice(0, 24);
		const ctx = assetChartCanvas.getContext('2d');
		if (!ctx) return;

		assetChart = new Chart(ctx, {
			type: 'bar',
			data: {
				labels: displayData.map(d => d.month),
				datasets: [
					{
						label: 'Projected (USDC)',
						data: displayData.map(d => d.projected),
						backgroundColor: '#08bccc',
						borderColor: '#08bccc',
						borderWidth: 0,
					},
					{
						label: 'Received To Date (USDC)',
						data: displayData.map(d => d.actual),
						backgroundColor: '#283c84',
						borderColor: '#283c84',
						borderWidth: 0,
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: true,
						position: 'bottom',
					}
				},
				scales: {
					y: {
						beginAtZero: true,
						ticks: {
							callback: function(value) {
								return 'US$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
							}
						}
					}
				}
			}
		});
	}

	function handleClose() {
		onClose();
	}

	// Update charts when data changes
	$: if (monthlyTokenCashflows && tokenChartCanvas && mode === 'token' && isOpen) {
		createTokenChart();
	}

	$: if (monthlyAssetCashflows && assetChartCanvas && mode === 'asset' && isOpen) {
		createAssetChart();
	}

	const displayClasses = 'fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50';
	const modalClasses = 'bg-white rounded-lg shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto';
	const headerClasses = 'sticky top-0 bg-white border-b border-light-gray p-6';
	const contentClasses = 'p-6 space-y-8';
	const titleClasses = 'text-2xl font-bold text-black';
	const subtitleClasses = 'text-sm text-gray-600 mt-1';
	const sectionClasses = 'space-y-4';
	const sectionTitleClasses = 'text-lg font-semibold text-black uppercase';
	const inputGroupClasses = 'flex flex-col gap-2';
	const labelClasses = 'text-sm font-medium text-black';
	const inputClasses = 'px-4 py-2 border border-light-gray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';
	const metricGridClasses = 'grid grid-cols-1 md:grid-cols-4 gap-4';
	const metricCardClasses = 'bg-light-gray p-4 rounded-lg';
	const metricValueClasses = 'text-2xl font-bold text-primary';
	const metricLabelClasses = 'text-xs font-semibold text-gray-600 uppercase mt-2';
	const footerClasses = 'sticky bottom-0 bg-white border-t border-light-gray p-6 flex gap-3 justify-end';
	const inputsGridClasses = 'grid grid-cols-1 md:grid-cols-3 gap-6';
</script>

<!-- Modal Backdrop -->
{#if isOpen}
	<div class={displayClasses} on:click={handleClose} on:keydown={(e) => e.key === 'Escape' && handleClose()} role="dialog" aria-modal="true" transition:fade={{ duration: 200 }}>
		<!-- Modal Content -->
		<div class={modalClasses} on:click|stopPropagation>
			<!-- Header -->
			<div class={headerClasses}>
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<h2 class={titleClasses}>Returns Calculator</h2>
						<p class={subtitleClasses}>
							{#if token}
								{token.releaseName}
							{:else}
								Load a token to calculate returns
							{/if}
						</p>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class={contentClasses}>
				{#if token}
					<!-- Assumptions - Show in both modes -->
					<div class="flex justify-center">
						<div class="bg-blue-50 border border-primary rounded px-3 py-1.5 inline-flex gap-4 items-center text-xs">
							<span class="font-semibold text-black uppercase">Assumptions:</span>
							<div class="flex items-center gap-2">
								<label class="text-xs font-medium text-black" for="oil-price">Oil Price (USD/bbl)</label>
								<input
									id="oil-price"
									type="number"
									bind:value={oilPrice}
									min="0"
									step="1"
									class="px-2 py-1 border border-light-gray rounded text-xs w-20 focus:outline-none focus:ring-1 focus:ring-primary"
								/>
							</div>
							<div class="flex items-center gap-2">
								<label class="text-xs font-medium text-black" for="discount-rate">Discount Rate (%)</label>
								<input
									id="discount-rate"
									type="number"
									bind:value={discountRate}
									min="0"
									max="50"
									step="0.1"
									class="px-2 py-1 border border-light-gray rounded text-xs w-20 focus:outline-none focus:ring-1 focus:ring-primary"
								/>
							</div>
						</div>
					</div>

					<!-- Charts Section -->
					<div class={sectionClasses}>
						<h3 class={sectionTitleClasses}>Returns On Minting Today</h3>

						<!-- Token Mode Column Chart -->
					<div class="bg-light-gray p-4 rounded-lg">
						{#if monthlyTokenCashflows.length > 0}
							<div style="height: 400px;">
								<canvas bind:this={tokenChartCanvas}></canvas>
							</div>
						{:else}
							<p class="text-center text-gray-600 p-4">No token cashflows calculated</p>
						{/if}
					</div>
					</div>

						<div class={sectionClasses}>
							<h3 class={sectionTitleClasses}>Financial Metrics</h3>

							<!-- Remaining Metrics Row -->
							<div class="mb-6">
								<h4 class="text-sm font-semibold text-gray-600 uppercase mb-3">Remaining (From Today)</h4>
								<div class={metricGridClasses}>
									<div class={metricCardClasses}>
										<div class={metricValueClasses}>
											{isFinite(remainingIRR) ? remainingIRR.toFixed(2) : '—'}%
										</div>
										<div class={metricLabelClasses}>Annualized IRR</div>
									</div>
									<div class={metricCardClasses}>
										<div class={metricValueClasses}>
											${remainingNPV.toFixed(6)}
										</div>
										<div class={metricLabelClasses}>NPV @ {discountRate}%</div>
									</div>
									<div class={metricCardClasses}>
										<div class={metricValueClasses}>
											{isFinite(remainingPayback) ? remainingPayback.toFixed(1) : '—'} mo
										</div>
										<div class={metricLabelClasses}>Payback Period</div>
									</div>
									<div class={metricCardClasses}>
										<div class={metricValueClasses}>
											{isFinite(remainingAPR) ? remainingAPR.toFixed(2) : '—'}%
										</div>
										<div class={metricLabelClasses}>APR</div>
									</div>
								</div>
							</div>

							<!-- Lifetime Metrics Row -->
							<div>
								<h4 class="text-sm font-semibold text-gray-600 uppercase mb-3">Lifetime (From Start)</h4>
								<div class={metricGridClasses}>
									<div class={metricCardClasses}>
										<div class={metricValueClasses}>
											{isFinite(lifetimeIRR) ? lifetimeIRR.toFixed(2) : '—'}%
										</div>
										<div class={metricLabelClasses}>Annualized IRR</div>
									</div>
									<div class={metricCardClasses}>
										<div class={metricValueClasses}>
											${lifetimeNPV.toFixed(6)}
										</div>
										<div class={metricLabelClasses}>NPV @ {discountRate}%</div>
									</div>
									<div class={metricCardClasses}>
										<div class={metricValueClasses}>
											{isFinite(lifetimePayback) ? lifetimePayback.toFixed(1) : '—'} mo
										</div>
										<div class={metricLabelClasses}>Payback Period</div>
									</div>
									<div class={metricCardClasses}>
										<div class={metricValueClasses}>
											{isFinite(lifetimeAPR) ? lifetimeAPR.toFixed(2) : '—'}%
										</div>
										<div class={metricLabelClasses}>APR</div>
									</div>
								</div>
							</div>
						</div>
				{:else}
					<div class="text-center py-12">
						<p class="text-gray-600">No token data available. Please select a token to calculate returns.</p>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class={footerClasses}>
				<SecondaryButton on:click={handleClose}>Close</SecondaryButton>
			</div>
		</div>
	</div>
{/if}
