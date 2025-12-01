<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { TokenMetadata } from '$lib/types/MetaboardTypes';
	import {
		calculateMonthlyTokenCashflows,
		calculateNPV,
		calculateIRR,
		calculatePaybackPeriod,
		calculateLifetimeIRR,
		getLifetimeCashflows,
	} from '$lib/utils/returnsEstimatorHelpers';
	import { Chart, registerables } from 'chart.js';

	Chart.register(...registerables);

	// Props
	export let isOpen = false;
	export let token: TokenMetadata | null = null;
	export let onClose: () => void = () => {};
	export let mintedSupply: number = 0; // Minted supply for normalizing cashflows per token
	export let availableSupply: number = 0; // Available supply (already calculated)

	// Constants
	const mintPrice = 1; // Price per token in USD (may be configurable in future)

	// User inputs
	let oilPrice = 65;
	let discountRate = 10;
	let numberOfTokens = 1;

	// Reset assumptions and calculate when modal opens
	$: if (isOpen && token) {
		oilPrice = 65;
		discountRate = 10;
		// Default to 1 token, unless available supply is between 0 and 1 (fractional)
		// When sold out (availableSupply <= 0), use 1 for illustrative purposes
		numberOfTokens = availableSupply > 0 && availableSupply < 1 ? parseFloat(availableSupply.toFixed(3)) : 1;
		// Explicitly trigger calculation after reset
		updateCalculations();
	}

	// Validation error for numberOfTokens
	// Use a small epsilon to handle floating point precision issues
	// Don't show error when sold out (availableSupply <= 0) since calculator is for illustration only
	$: tokensError = availableSupply > 0 && (numberOfTokens - availableSupply) > 0.0001 ? `Only ${availableSupply.toFixed(3)} tokens available` : '';

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

	// Chart.js instance
	let tokenChart: Chart | null = null;
	let tokenChartCanvas: HTMLCanvasElement;

	// Tooltip state
	let tooltipId = '';
	let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

	function showTooltipWithDelay(id: string, delay = 500) {
		if (tooltipTimer) {
			clearTimeout(tooltipTimer);
		}
		tooltipTimer = setTimeout(() => {
			tooltipId = id;
		}, delay);
	}

	function hideTooltip() {
		if (tooltipTimer) {
			clearTimeout(tooltipTimer);
			tooltipTimer = null;
		}
		tooltipId = '';
	}

	// Tooltip configuration (static)
	const tooltips = {
		irr: 'A standard project finance measure of return, IRR is used to account for the early repayment of principal in project finance, rapidly reducing remaining investment exposure. IRR is calculated as the discount rate where NPV = 0 and the project is breakeven.',
		npv: 'The profit or loss on this investment after adjusting all cashflows for the time value of money. It recognises that money now is worth more than money in the future due to inflation and opportunity cost.',
		payback: 'The number of months before you\'ve recouped your investment, in nominal amounts.',
		apr: 'Annual Percentage Rate is the annualised rate of return without accounting for time value of money. E.g. a single lump sum at the end of the year has the same value as one at the beginning. It is the most conservative measure and is calculated as the total return divided by number of years.'
	};

	// Reactive metrics arrays - these re-run when values change, maintaining Svelte reactivity
	$: remainingMetrics = [
		{
			key: 'irr',
			label: 'Annualized IRR',
			value: remainingIRR,
			formatted: `${isFinite(remainingIRR) ? remainingIRR.toFixed(2) : '—'}%`,
			tooltip: tooltips.irr
		},
		{
			key: 'npv',
			label: `NPV @ ${discountRate}%`,
			value: remainingNPV,
			formatted: `$${remainingNPV.toFixed(2)}`,
			tooltip: tooltips.npv
		},
		{
			key: 'payback',
			label: 'Payback Period',
			value: remainingPayback,
			formatted: `${isFinite(remainingPayback) ? remainingPayback.toFixed(1) : '—'} mo`,
			tooltip: tooltips.payback
		},
		{
			key: 'apr',
			label: 'APR',
			value: remainingAPR,
			formatted: `${isFinite(remainingAPR) ? remainingAPR.toFixed(2) : '—'}%`,
			tooltip: tooltips.apr
		}
	];

	$: lifetimeMetrics = [
		{
			key: 'irr',
			label: 'Annualized IRR',
			value: lifetimeIRR,
			formatted: `${isFinite(lifetimeIRR) ? lifetimeIRR.toFixed(2) : '—'}%`,
			tooltip: tooltips.irr
		},
		{
			key: 'npv',
			label: `NPV @ ${discountRate}%`,
			value: lifetimeNPV,
			formatted: `$${lifetimeNPV.toFixed(2)}`,
			tooltip: tooltips.npv
		},
		{
			key: 'payback',
			label: 'Payback Period',
			value: lifetimePayback,
			formatted: `${isFinite(lifetimePayback) ? lifetimePayback.toFixed(1) : '—'} mo`,
			tooltip: tooltips.payback
		},
		{
			key: 'apr',
			label: 'APR',
			value: lifetimeAPR,
			formatted: `${isFinite(lifetimeAPR) ? lifetimeAPR.toFixed(2) : '—'}%`,
			tooltip: tooltips.apr
		}
	];

	// Reactive calculations
	$: if (token && isOpen) {
		updateCalculations();
	}

	// Update when user changes inputs - trigger on any input change
	$: if (token) {
		void(oilPrice); void(discountRate); void(numberOfTokens);
		updateCalculations();
	}

	function updateCalculations() {
		if (!token) return;

		// Don't calculate if there's a validation error
		if (tokensError) return;

		try {
			// Remaining cashflows
			monthlyTokenCashflows = calculateMonthlyTokenCashflows(token, oilPrice, mintedSupply, numberOfTokens);

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

				// Calculate remaining APR: ((total_returns / initial_investment)^(12/count_periods) - 1) * 100
				const totalMintCost = mintPrice * numberOfTokens;
				const sumAllCashflows = cashflows.reduce((sum, cf) => sum + cf, 0);
				const totalReturns = sumAllCashflows + totalMintCost;
				const countPeriods = cashflows.length - 1; // Number of periods (excluding initial investment)
				if (countPeriods > 0 && totalReturns > 0 && totalMintCost > 0) {
					remainingAPR = (Math.pow(totalReturns / totalMintCost, 12 / countPeriods) - 1) * 100;
				} else {
					remainingAPR = -99;
				}
			}

			// Lifetime calculations
			lifetimeIRR = calculateLifetimeIRR(token, oilPrice, mintedSupply, numberOfTokens);

			// Calculate lifetime cashflows for NPV, Payback, and APR
			const lifetimeCashflows = getLifetimeCashflows(token, oilPrice, mintedSupply, numberOfTokens);

			if (lifetimeCashflows.length > 0) {
				// Calculate lifetime NPV using monthly discount rate
				const monthlyDiscountRate = Math.pow(1 + discountRate / 100, 1 / 12) - 1;
				lifetimeNPV = calculateNPV(lifetimeCashflows, monthlyDiscountRate);

				// Calculate lifetime payback period
				lifetimePayback = calculatePaybackPeriod(lifetimeCashflows);

				// Calculate lifetime APR: ((total_returns / initial_investment)^(12/count_periods) - 1) * 100
				const totalMintCost = mintPrice * numberOfTokens;
				const sumAllCashflows = lifetimeCashflows.reduce((sum, cf) => sum + cf, 0);
				const totalReturns = sumAllCashflows + totalMintCost;
				const countPeriods = lifetimeCashflows.length - 1; // Number of periods (excluding initial investment)
				if (countPeriods > 0 && totalReturns > 0 && totalMintCost > 0) {
					lifetimeAPR = (Math.pow(totalReturns / totalMintCost, 12 / countPeriods) - 1) * 100;
				} else {
					lifetimeAPR = -99;
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

		const displayData = monthlyTokenCashflows;

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

	function handleClose() {
		isOpen = false;
		onClose();
	}

	function setFullyDilutedReturns() {
		numberOfTokens = availableSupply;
	}

	// Update chart when data changes
	$: if (monthlyTokenCashflows && tokenChartCanvas && isOpen) {
		createTokenChart();
	}

	const displayClasses = 'fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50';
	const modalClasses = 'bg-white rounded-none shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto';
	const headerClasses = 'sticky top-0 bg-white border-b border-light-gray p-6';
	const contentClasses = 'p-6 space-y-8';
	const titleClasses = 'text-2xl font-bold text-black text-left';
	const subtitleClasses = 'text-sm text-gray-600 mt-1 text-left';
	const sectionClasses = 'space-y-4';
	const sectionTitleClasses = 'text-lg font-semibold text-black uppercase text-left';
	const metricGridClasses = 'grid grid-cols-1 md:grid-cols-4 gap-4';
	const metricCardClasses = 'bg-light-gray p-4 rounded-none';
	const metricValueClasses = 'text-2xl font-bold text-primary';
	const metricLabelClasses = 'text-xs text-gray-600 mt-2';
	const metricLabelTextClasses = 'font-semibold uppercase';
</script>

<!-- Modal Backdrop -->
{#if isOpen}
	<div class={displayClasses} on:click={handleClose} on:keydown={(e) => e.key === 'Escape' && handleClose()} role="dialog" aria-modal="true" tabindex="-1" transition:fade={{ duration: 200 }}>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions a11y-click-events-have-key-events -->
		<!-- Modal Content -->
		<div class={modalClasses} role="document" tabindex="-1" on:click|stopPropagation>
			<!-- Header -->
			<div class={headerClasses}>
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<h2 class={titleClasses}>Returns Estimator</h2>
						<p class={subtitleClasses}>
							{#if token}
								{token.releaseName}
							{:else}
								Load a token to calculate returns
							{/if}
						</p>
					</div>
					<button
						type="button"
						on:click={handleClose}
						class="text-gray-400 hover:text-gray-600 transition-colors ml-4"
						aria-label="Close modal"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Content -->
			<div class={contentClasses}>
				{#if token}
					<!-- Assumptions - Show in both modes -->
					{@const crudeBenchmark = token.asset?.technical?.crudeBenchmark || ''}
					{@const oilPriceLabel = crudeBenchmark ? `${crudeBenchmark} Oil Price (USD/bbl)` : 'Oil Price (USD/bbl)'}
					<div class="flex justify-center">
						<div class="bg-blue-50 border border-primary rounded-none px-3 py-1.5 inline-flex gap-4 items-center text-xs">
							<span class="font-semibold text-black uppercase">Assumptions:</span>
							<div class="flex items-center gap-2">
								<label class="text-xs font-medium text-black" for="oil-price">{oilPriceLabel}</label>
								<input
									id="oil-price"
									type="number"
									bind:value={oilPrice}
									min="0"
									step="1"
									class="px-2 py-1 border border-light-gray rounded-none text-xs w-20 focus:outline-none focus:ring-1 focus:ring-primary"
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
									class="px-2 py-1 border border-light-gray rounded-none text-xs w-20 focus:outline-none focus:ring-1 focus:ring-primary"
								/>
							</div>
							<div class="flex flex-col gap-1">
								<div class="flex items-center gap-2">
									<label class="text-xs font-medium text-black" for="number-of-tokens">Tokens to Buy</label>
									<input
										id="number-of-tokens"
										type="number"
										bind:value={numberOfTokens}
										min="0"
										max={availableSupply}
										step={availableSupply < 1 ? "0.001" : "1"}
										class="px-2 py-1 border {tokensError ? 'border-red-500' : 'border-light-gray'} rounded text-xs w-20 focus:outline-none focus:ring-1 focus:ring-primary"
									/>
									<button
										type="button"
										on:click={() => numberOfTokens = availableSupply}
										class="px-2 py-1 bg-primary text-white text-xs font-medium rounded-none hover:bg-opacity-90 transition-colors"
									>
										Max
									</button>
								</div>
								{#if tokensError}
									<span class="text-xs text-red-500 ml-auto">{tokensError}</span>
								{/if}
							</div>
						</div>
					</div>

					<!-- Sold Out Notice -->
					{#if availableSupply <= 0}
						<div class="flex justify-center">
							<div class="bg-gray-100 border border-gray-300 rounded-none px-4 py-2 inline-flex items-center gap-2 text-sm">
								<span class="text-gray-600 font-medium">Sold out. Numbers shown for illustrative purposes.</span>
							</div>
						</div>
					{/if}

					<!-- Charts Section -->
					<div class={sectionClasses}>
						<h3 class={sectionTitleClasses}>Returns On Minting Today</h3>

						<!-- Token Mode Column Chart -->
					<div class="bg-light-gray p-4 rounded-none">
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
						<div class="flex items-center justify-between mb-4">
							<h3 class={sectionTitleClasses}>Return Metrics</h3>
							<button
								type="button"
								on:click={setFullyDilutedReturns}
								class="px-3 py-1.5 bg-secondary text-white text-xs font-medium rounded-none hover:bg-opacity-90 transition-colors"
							>
								View Fully Diluted Returns
							</button>
						</div>

						{#each [{title: 'Remaining (From Today)', metrics: remainingMetrics, suffix: 'remaining'}, {title: 'Lifetime (From Start)', metrics: lifetimeMetrics, suffix: 'lifetime'}] as section (section.suffix)}
							<div class={section.suffix === 'remaining' ? 'mb-6' : ''}>
								<h4 class="text-sm font-semibold text-gray-600 uppercase mb-3 text-left">{section.title}</h4>
								<div class={metricGridClasses}>
									{#each section.metrics as metric (metric.key)}
										<div class={metricCardClasses}>
											<div class={metricValueClasses}>
												{metric.formatted}
											</div>
											<div class={`${metricLabelClasses} relative flex items-center justify-center gap-1`}>
												<span class={metricLabelTextClasses}>{metric.label}</span>
												<span
													class="inline-flex items-center justify-center w-3 h-3 rounded-full bg-gray-300 text-black text-[8px] font-bold cursor-help hover:bg-gray-400 transition-colors"
													on:mouseenter={() => showTooltipWithDelay(`${metric.key}-tooltip-${section.suffix}`)}
													on:mouseleave={hideTooltip}
													on:focus={() => showTooltipWithDelay(`${metric.key}-tooltip-${section.suffix}`, 0)}
													on:blur={hideTooltip}
													tabindex="0"
													role="button"
												>
													?
												</span>
												{#if tooltipId === `${metric.key}-tooltip-${section.suffix}`}
													<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 p-3 rounded-none text-xs leading-snug z-[10000] mb-[6px] w-72 max-w-[320px] whitespace-normal break-words text-left bg-black text-white shadow-lg">
														{metric.tooltip}
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-center py-12">
						<p class="text-gray-600">No token data available. Please select a token to calculate returns.</p>
					</div>
				{/if}
			</div>

		</div>
	</div>
{/if}

<style>
	/* Hide number input spinners/arrows for all number inputs in the calculator */
	input[type='number']::-webkit-outer-spin-button,
	input[type='number']::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	input[type='number'] {
		-moz-appearance: textfield;
		appearance: textfield;
	}
</style>
