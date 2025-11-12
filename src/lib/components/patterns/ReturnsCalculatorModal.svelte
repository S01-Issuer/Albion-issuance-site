<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { TokenMetadata } from '$lib/types/MetaboardTypes';
	import { PrimaryButton, SecondaryButton } from '$lib/components/components';
	import {
		calculateMonthlyTokenCashflows,
		calculateMonthlyAssetCashflows,
		calculateNPV,
		calculateIRR,
		calculatePaybackPeriod,
	} from '$lib/utils/returnsCalculatorHelpers';
	import FormattedNumber from '$lib/components/components/FormattedNumber.svelte';

	// Props
	export let isOpen = false;
	export let token: TokenMetadata | null = null;
	export let mode: 'token' | 'asset' = 'token';
	export let onClose: () => void = () => {};
	export let mintedSupply: number = 0; // Minted supply for normalizing cashflows per token

	// User inputs
	let oilPrice = 65;
	let discountRate = 10;
	let showAssetData = false; // Toggle between token and asset mode data view

	// Token Mode Calculated values
	let monthlyTokenCashflows: Array<{ month: string; cashflow: number }> = [];
	let npv = 0;
	let annualizedIRR = 0;
	let paybackMonths = Infinity;

	// Asset Mode Calculated values
	let monthlyAssetCashflows: Array<{ month: string; projected: number; actual: number }> = [];
	let totalProjectedAsset = 0;
	let totalActualAsset = 0;

	// Chart dimensions
	const chartWidth = 900;
	const chartHeight = 400;
	const margin = { top: 20, right: 20, bottom: 60, left: 60 };
	const innerWidth = chartWidth - margin.left - margin.right;
	const innerHeight = chartHeight - margin.top - margin.bottom;

	// Reactive calculations
	$: if (token && isOpen) {
		updateCalculations();
	}

	// Update when user changes inputs - trigger on any input change
	$: if (token) {
		oilPrice, discountRate;
		updateCalculations();
	}

	function updateCalculations() {
		if (!token) return;

		try {
			if (mode === 'token') {
				// Token Mode Calculations
				monthlyTokenCashflows = calculateMonthlyTokenCashflows(token, oilPrice, mintedSupply);

				if (monthlyTokenCashflows.length > 0) {
					const cashflows = monthlyTokenCashflows.map((m) => m.cashflow);

					// Calculate NPV using monthly discount rate
					const monthlyDiscountRate = Math.pow(1 + discountRate / 100, 1 / 12) - 1;
					npv = calculateNPV(cashflows, monthlyDiscountRate);

					// Calculate IRR (returns monthly rate as decimal)
					const monthlyIRR = calculateIRR(cashflows);
					// Annualize: (1 + monthlyRate)^12 - 1, then convert to percentage
					annualizedIRR = monthlyIRR > -0.99 ? (Math.pow(1 + monthlyIRR, 12) - 1) * 100 : -99;

					// Calculate payback period in months
					paybackMonths = calculatePaybackPeriod(cashflows);
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

	function getTokenChartData() {
		if (monthlyTokenCashflows.length === 0) return [];

		const displayData = monthlyTokenCashflows.slice(0, 24);
		const minCashflow = Math.min(...displayData.map((m) => m.cashflow), 0);
		const maxCashflow = Math.max(...displayData.map((m) => m.cashflow), 0);
		const range = Math.max(Math.abs(minCashflow), Math.abs(maxCashflow));
		const chartCenter = innerHeight / 2;

		return displayData.map((item, index) => ({
			month: item.month,
			cashflow: item.cashflow,
			x: margin.left + (index / Math.max(displayData.length - 1, 1)) * innerWidth,
			y: range > 0
				? margin.top + chartCenter - (item.cashflow / range) * (chartCenter - 10)
				: margin.top + chartCenter,
			height: range > 0 ? Math.abs((item.cashflow / range) * (chartCenter - 10)) : 0,
			color: item.cashflow >= 0 ? '#08bccc' : '#ff6b6b',
		}));
	}

	function getAssetChartData() {
		if (monthlyAssetCashflows.length === 0) return [];

		const displayData = monthlyAssetCashflows.slice(0, 24);
		const allValues = displayData.flatMap((m) => [m.projected, m.actual]);
		const maxValue = Math.max(...allValues, 0);
		const chartCenter = innerHeight / 2;

		return displayData.map((item, index) => {
			const barWidth = 6;
			const spacing = 4;
			const groupX = margin.left + (index / Math.max(displayData.length - 1, 1)) * innerWidth;

			return {
				month: item.month,
				projected: item.projected,
				actual: item.actual,
				projectedX: groupX - spacing - barWidth / 2,
				projectedY: maxValue > 0
					? margin.top + chartCenter - (item.projected / maxValue) * (chartCenter - 10)
					: margin.top + chartCenter,
				projectedHeight: maxValue > 0 ? (item.projected / maxValue) * (chartCenter - 10) : 0,
				actualX: groupX + spacing + barWidth / 2,
				actualY: maxValue > 0
					? margin.top + chartCenter - (item.actual / maxValue) * (chartCenter - 10)
					: margin.top + chartCenter,
				actualHeight: maxValue > 0 ? (item.actual / maxValue) * (chartCenter - 10) : 0,
				barWidth,
			};
		});
	}

	function handleClose() {
		onClose();
	}

	$: tokenChartData = getTokenChartData();
	$: assetChartData = getAssetChartData();

	const displayClasses = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
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
				<h2 class={titleClasses}>Returns Calculator</h2>
				<p class={subtitleClasses}>
					{#if token}
						{token.releaseName} • {mode === 'token' ? 'Token' : 'Asset'} Mode
					{:else}
						Load a token to calculate returns
					{/if}
				</p>
			</div>

			<!-- Content -->
			<div class={contentClasses}>
				{#if token}
					{#if mode === 'token'}
						<!-- TOKEN MODE -->
						<!-- Data Toggle -->
						<div class={sectionClasses}>
							<h3 class={sectionTitleClasses}>Monthly Returns Data</h3>
							<div class="flex gap-4 mb-4">
								<button
									on:click={() => (showAssetData = false)}
									class={`px-4 py-2 rounded font-semibold transition-colors ${
										!showAssetData
											? 'bg-primary text-white'
											: 'bg-light-gray text-black hover:bg-gray-300'
									}`}
								>
									Token Mode
								</button>
								<button
									on:click={() => (showAssetData = true)}
									class={`px-4 py-2 rounded font-semibold transition-colors ${
										showAssetData
											? 'bg-primary text-white'
											: 'bg-light-gray text-black hover:bg-gray-300'
									}`}
								>
									Asset Mode
								</button>
							</div>

							<!-- Token Mode Data Table -->
							{#if !showAssetData}
								<div class="overflow-x-auto bg-light-gray p-4 rounded-lg">
									<table class="w-full text-sm border-collapse">
										<thead>
											<tr class="border-b border-gray-300">
												<th class="text-left p-2 font-semibold text-black">Month</th>
												<th class="text-right p-2 font-semibold text-black">Cashflow (USDC)</th>
											</tr>
										</thead>
										<tbody>
											{#each monthlyTokenCashflows.slice(0, 24) as row, index}
												<tr class={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
													<td class="p-2 text-black">{row.month}</td>
													<td class="text-right p-2 text-black font-mono">${row.cashflow.toFixed(6)}</td>
												</tr>
											{/each}
										</tbody>
									</table>
									{#if monthlyTokenCashflows.length === 0}
										<p class="text-center text-gray-600 p-4">No token cashflows calculated</p>
									{/if}
								</div>
							{:else}
								<!-- Asset Mode Data Table -->
								<div class="overflow-x-auto bg-light-gray p-4 rounded-lg">
									<table class="w-full text-sm border-collapse">
										<thead>
											<tr class="border-b border-gray-300">
												<th class="text-left p-2 font-semibold text-black">Month</th>
												<th class="text-right p-2 font-semibold text-black">Projected (USDC)</th>
												<th class="text-right p-2 font-semibold text-black">Actual (USDC)</th>
											</tr>
										</thead>
										<tbody>
											{#each monthlyAssetCashflows.slice(0, 24) as row, index}
												<tr class={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
													<td class="p-2 text-black">{row.month}</td>
													<td class="text-right p-2 text-black font-mono">${row.projected.toFixed(6)}</td>
													<td class="text-right p-2 text-black font-mono">${row.actual.toFixed(6)}</td>
												</tr>
											{/each}
										</tbody>
									</table>
									{#if monthlyAssetCashflows.length === 0}
										<p class="text-center text-gray-600 p-4">No asset cashflows calculated</p>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Financial Metrics -->
						<div class={sectionClasses}>
							<h3 class={sectionTitleClasses}>Financial Metrics</h3>
							<div class={metricGridClasses}>
								<div class={metricCardClasses}>
									<div class={metricValueClasses}>
										{isFinite(annualizedIRR) ? annualizedIRR.toFixed(2) : '—'}%
									</div>
									<div class={metricLabelClasses}>IRR (Annualized)</div>
								</div>
								<div class={metricCardClasses}>
									<div class={metricValueClasses}>
										${npv.toFixed(6)}
									</div>
									<div class={metricLabelClasses}>NPV @ {discountRate}%</div>
								</div>
								<div class={metricCardClasses}>
									<div class={metricValueClasses}>
										{isFinite(paybackMonths) ? paybackMonths.toFixed(1) : '—'} mo
									</div>
									<div class={metricLabelClasses}>Payback Period</div>
								</div>
							</div>
						</div>

						<!-- User Inputs -->
						<div class={sectionClasses}>
							<h3 class={sectionTitleClasses}>Model Inputs</h3>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div class={inputGroupClasses}>
									<label class={labelClasses} for="oil-price">Oil Price (USD/bbl)</label>
									<input
										id="oil-price"
										type="number"
										bind:value={oilPrice}
										min="0"
										step="1"
										class={inputClasses}
									/>
									<span class="text-xs text-gray-500">Default: $65/bbl</span>
								</div>
								<div class={inputGroupClasses}>
									<label class={labelClasses} for="discount-rate">Discount Rate (%)</label>
									<input
										id="discount-rate"
										type="number"
										bind:value={discountRate}
										min="0"
										max="50"
										step="0.1"
										class={inputClasses}
									/>
									<span class="text-xs text-gray-500">Default: 10% annual</span>
								</div>
							</div>
						</div>

						<!-- Data Info -->
						<div class="bg-blue-50 border border-primary rounded-lg p-4">
							<p class="text-sm text-black">
								<strong>Token Share:</strong> {token.sharePercentage}% of asset
								<br />
								<strong>Pending Distributions:</strong> Applied to first 12 months from cashflow start date (only remaining months shown)
								<br />
								<strong>Production Data:</strong> {token.asset.plannedProduction?.projections.length ?? 0} months
							</p>
						</div>
					{:else}
						<!-- ASSET MODE -->
						<!-- Chart Section -->
						<div class={sectionClasses}>
							<h3 class={sectionTitleClasses}>Projected vs Actual Revenue</h3>
							<div class="flex justify-center overflow-x-auto bg-light-gray p-6 rounded-lg">
								<svg {chartWidth} {chartHeight} viewBox="0 0 {chartWidth} {chartHeight}" class="min-w-full">
									<!-- Y-axis -->
									<line x1={margin.left} y1={margin.top} x2={margin.left} y2={chartHeight - margin.bottom} stroke="#d0d0d0" stroke-width="2" />
									<!-- X-axis -->
									<line x1={margin.left} y1={chartHeight - margin.bottom} x2={chartWidth - margin.right} y2={chartHeight - margin.bottom} stroke="#d0d0d0" stroke-width="2" />
									<!-- Y label -->
									<text x="20" y={margin.top + innerHeight / 2} text-anchor="middle" font-size="12" fill="#666" transform="rotate(-90 20 {margin.top + innerHeight / 2})">
										Revenue ($)
									</text>
									<!-- Bars -->
									{#each assetChartData as bar, index}
										<!-- Projected -->
										<rect
											x={bar.projectedX - bar.barWidth / 2}
											y={bar.projectedY}
											width={bar.barWidth}
											height={bar.projectedHeight}
											fill="#08bccc"
											opacity="0.6"
										/>
										<!-- Actual -->
										<rect
											x={bar.actualX - bar.barWidth / 2}
											y={bar.actualY}
											width={bar.barWidth}
											height={bar.actualHeight}
											fill="#08bccc"
											opacity="1"
										/>
										{#if index % 3 === 0}
											<text x={margin.left + (index / Math.max(assetChartData.length - 1, 1)) * innerWidth} y={chartHeight - 20} text-anchor="middle" font-size="11" fill="#666">
												{bar.month}
											</text>
										{/if}
									{/each}
								</svg>
							</div>

							<!-- Legend -->
							<div class="flex gap-6 mt-4 justify-center text-sm">
								<div class="flex items-center gap-2">
									<div class="w-3 h-3 rounded" style="background-color: #08bccc; opacity: 0.6;"></div>
									<span class="text-black">Projected</span>
								</div>
								<div class="flex items-center gap-2">
									<div class="w-3 h-3 rounded" style="background-color: #08bccc;"></div>
									<span class="text-black">Actual</span>
								</div>
							</div>
						</div>

						<!-- Summary Metrics -->
						<div class={sectionClasses}>
							<h3 class={sectionTitleClasses}>Revenue Summary</h3>
							<div class="grid grid-cols-2 gap-4">
								<div class={metricCardClasses}>
									<div class={metricValueClasses}>
										${totalProjectedAsset.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
									</div>
									<div class={metricLabelClasses}>Total Projected</div>
								</div>
								<div class={metricCardClasses}>
									<div class={metricValueClasses}>
										${totalActualAsset.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
									</div>
									<div class={metricLabelClasses}>Total Actual</div>
								</div>
							</div>
						</div>

						<!-- User Input -->
						<div class={sectionClasses}>
							<h3 class={sectionTitleClasses}>Model Input</h3>
							<div class="flex flex-col gap-2">
								<label class={labelClasses} for="asset-oil-price">Oil Price (USD/bbl)</label>
								<input
									id="asset-oil-price"
									type="number"
									bind:value={oilPrice}
									min="0"
									step="1"
									class={inputClasses}
								/>
								<span class="text-xs text-gray-500">Default: $65/bbl</span>
							</div>
						</div>

						<!-- Data Info -->
						<div class="bg-blue-50 border border-primary rounded-lg p-4">
							<p class="text-sm text-black">
								<strong>Note:</strong> Chart shows {assetChartData.length} months: {assetChartData.filter((m) => m.actual > 0).length} months actual, {assetChartData.filter((m) => m.actual === 0).length} months projected.
							</p>
						</div>
					{/if}
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
