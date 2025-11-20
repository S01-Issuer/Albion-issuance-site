<script lang="ts">
	import type { Asset } from '$lib/types/uiTypes';
	import type { TokenMetadata } from '$lib/types/MetaboardTypes';
	import SectionTitle from '$lib/components/components/SectionTitle.svelte';
	import { formatEndDate } from '$lib/utils/formatters';
	import { useTooltip } from '$lib/composables';

export let asset: Asset;
export let onLocationClick: (() => void) | undefined = undefined;
export let primaryToken: TokenMetadata | null | undefined = undefined;

	const { showTooltipWithDelay, hideTooltip, showTooltip } = useTooltip();



	function formatPricing(benchmarkPremium: string, transportCosts: string): string {
		let pricingText = '';
		
		// Format benchmark premium/discount
		if (benchmarkPremium) {
			const value = benchmarkPremium.replace(/[^-+\d.]/g, '');
			if (value.startsWith('-')) {
				pricingText = `US$${value.substring(1)} discount to benchmark`;
			} else if (value.startsWith('+')) {
				pricingText = `US$${value.substring(1)} premium to benchmark`;
			} else if (value !== '0') {
				pricingText = `US$${value} premium to benchmark`;
			}
		}
		
		// Format transport costs (always show, even if zero)
		if (transportCosts !== undefined && transportCosts !== null) {
			const costValue = transportCosts.replace(/[^-+\d.]/g, '') || '0';
			if (pricingText) {
				pricingText += '\n';
			}
			pricingText += `US$${costValue} transport costs`;
		}
		
		return pricingText || 'At benchmark';
	}
</script>

<div class="flex-1 flex flex-col">
	<div class="grid md:grid-cols-2 grid-cols-1 gap-12 mb-12">
		<div>
			<SectionTitle level="h3" size="subsection" className="mb-6 uppercase tracking-wider">Asset Fundamentals</SectionTitle>
			<div class="flex flex-col gap-4">
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">Field Type</span>
					<span class="text-black">{asset?.technical?.fieldType}</span>
				</div>
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">Crude Benchmark</span>
					<span class="text-black">{asset?.technical?.crudeBenchmark}</span>
				</div>
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">Pricing</span>
					<span class="text-black whitespace-pre-line text-right">{formatPricing(asset?.technical?.pricing?.benchmarkPremium || '', asset?.technical?.pricing?.transportCosts || '')}</span>
				</div>
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">First Oil</span>
					<span class="text-black">{formatEndDate(asset?.technical?.firstOil || '')}</span>
				</div>
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">Estimated End Date</span>
					<span class="text-black">{formatEndDate(asset?.technical?.expectedEndDate || '')}</span>
				</div>
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">Coordinates</span>
					{#if asset?.location?.coordinates}
						<button
							type="button"
							class="text-black text-right bg-transparent border-0 p-0 cursor-pointer transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-60 inline-flex items-center justify-end gap-2"
							on:click={onLocationClick}
							disabled={!onLocationClick}
						>
							{asset.location.coordinates.lat}°, {asset.location.coordinates.lng}°
							<svg
								class="w-4 h-4"
								viewBox="0 0 640 640"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M576 112C576 103.7 571.7 96 564.7 91.6C557.7 87.2 548.8 86.8 541.4 90.5L416.5 152.1L244 93.4C230.3 88.7 215.3 89.6 202.1 95.7L77.8 154.3C69.4 158.2 64 166.7 64 176L64 528C64 536.2 68.2 543.9 75.1 548.3C82 552.7 90.7 553.2 98.2 549.7L225.5 489.8L396.2 546.7C409.9 551.3 424.7 550.4 437.8 544.2L562.2 485.7C570.6 481.7 576 473.3 576 464L576 112zM208 146.1L208 445.1L112 490.3L112 191.3L208 146.1zM256 449.4L256 148.3L384 191.8L384 492.1L256 449.4zM432 198L528 150.6L528 448.8L432 494L432 198z" />
							</svg>
						</button>
					{:else}
						<span class="text-black">N/A</span>
					{/if}
				</div>
			</div>
		</div>

		<div>
			<SectionTitle level="h3" size="subsection" className="mb-6 uppercase tracking-wider">Asset Terms</SectionTitle>
			<div class="flex flex-col gap-4">
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">Interest Type</span>
					<span class="text-black">{asset?.terms?.interestType}</span>
				</div>
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0 overflow-visible">
					<span class="font-semibold text-black relative flex items-center gap-1">
						Amount
						<span class="inline-flex items-center justify-center w-3 h-3 rounded-full bg-gray-300 text-black text-[8px] font-bold cursor-help hover:bg-gray-400 transition-colors"
							on:mouseenter={() => showTooltipWithDelay('amount')}
							on:mouseleave={hideTooltip}
							on:focus={() => showTooltipWithDelay('amount')}
							on:blur={hideTooltip}
							role="button"
							tabindex="0">?</span>
						{#if $showTooltip === 'amount'}
							<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded text-xs whitespace-nowrap z-[1000] mb-[5px] max-w-[200px] whitespace-normal text-left">
								All numbers shown have already been adjusted for the royalty percentage and represent the net amounts payable to token holders
							</div>
						{/if}
					</span>
					<span class="text-black">{asset?.terms?.amount}%</span>
				</div>
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">Payment Frequency</span>
					<span class="text-black">Monthly</span>
				</div>
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0 overflow-visible">
					<span class="font-semibold text-black relative flex items-center gap-1">
						Cash flow Start
						<span class="inline-flex items-center justify-center w-3 h-3 rounded-full bg-gray-300 text-black text-[8px] font-bold cursor-help hover:bg-gray-400 transition-colors"
							on:mouseenter={() => showTooltipWithDelay('cashflowStart')}
							on:mouseleave={hideTooltip}
							on:focus={() => showTooltipWithDelay('cashflowStart')}
							on:blur={hideTooltip}
							role="button"
							tabindex="0">?</span>
						{#if $showTooltip === 'cashflowStart'}
							<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white p-2 rounded text-xs whitespace-nowrap z-[1000] mb-[5px] max-w-[200px] whitespace-normal text-left">
								Tokens have a claim on cash flows from this month. Cash flows received before the token first payment date will be accrued and distributed after first payment date
							</div>
						{/if}
					</span>
					<span class="text-black">{formatEndDate(primaryToken?.asset?.cashflowStartDate || primaryToken?.firstPaymentDate || '')}</span>
				</div>
				<div class="flex justify-between pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">Water Depth</span>
					<span class="text-black">{asset?.location?.waterDepth || 'Onshore'}</span>
				</div>
				<div class="flex justify-between gap-4 pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">Infrastructure</span>
					<span class="text-black text-right flex-1">{asset?.technical?.infrastructure}</span>
				</div>
				<div class="flex justify-between gap-4 pb-3 border-b border-light-gray text-base last:border-b-0 last:pb-0">
					<span class="font-semibold text-black">Environmental</span>
					<span class="text-black text-right flex-1">{asset?.technical?.environmental}</span>
				</div>
			</div>
		</div>
	</div>

</div>
