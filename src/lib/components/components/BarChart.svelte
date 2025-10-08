<script lang="ts">
	import ChartTooltip from './ChartTooltip.svelte';
	
	export let data: Array<{ label: string; value: number }> = [];
	export let data2: Array<{ label: string; value: number }> = [];
	export let width: number = 950;
	export let height: number = 400;
	export let barColor: string = '#08bccc';
	export let barColor2: string = '#283c84';
	export let valuePrefix: string = '';
	export let valueSuffix: string = '';
	export let title: string = '';
	export let showValues: boolean = false;
	export let showGrid: boolean = true;
	export let series1Name: string = '';
	export let series2Name: string = '';
	
	// Helper to determine which labels to show based on data density
	function getLabelsToShow(
		points: Array<{ label: string; value: number }>,
	): { indices: number[]; showYear: boolean } {
		const count = points.length;
		let indices: number[] = [];
		let showYear = true;
		
		if (count <= 12) {
			// Show all months
			indices = points.map((_, i) => i);
		} else if (count <= 24) {
			// Show every other month
			indices = points.map((_, i) => i).filter((i) => i % 2 === 0);
		} else if (count <= 48) {
			// Show quarterly (Jan, Apr, Jul, Oct)
			indices = points.map((_, i) => {
				try {
					const dateStr = points[i].label.includes('T') ? points[i].label : points[i].label + 'T00:00:00';
					const date = new Date(dateStr);
					if (isNaN(date.getTime())) return -1;
					const month = date.getMonth();
					return [0, 3, 6, 9].includes(month) ? i : -1;
				} catch {
					return -1;
				}
			}).filter((i) => i >= 0);
		} else {
			// Show only years
			indices = points.map((_, i) => {
				const dateStr = points[i].label.includes('T') ? points[i].label : points[i].label + 'T00:00:00';
				const date = new Date(dateStr);
				const prevDateStr = i > 0 ? (points[i - 1].label.includes('T') ? points[i - 1].label : points[i - 1].label + 'T00:00:00') : null;
				const prevDate = prevDateStr ? new Date(prevDateStr) : null;
				return !prevDate || date.getFullYear() !== prevDate.getFullYear() ? i : -1;
			}).filter((i) => i >= 0);
			showYear = false; // Don't show year separately as it's in the label
		}
		
		return { indices, showYear };
	}
	
	let svg: SVGSVGElement;
	let tooltipData = {
		show: false,
		x: 0,
		y: 0,
		value: 0,
		label: ''
	};
	
	const padding = { top: 40, right: 20, bottom: 80, left: 60 } as const; // Increased bottom padding for legend and x-axis labels
	const chartWidth = width - padding.left - padding.right;
	const chartHeight = height - padding.top - padding.bottom;
	const TICK_COUNT = 6;
	const yTickIndices = Array.from({ length: TICK_COUNT }, (_, i) => i);
	
	// Function to round to nice numbers (1-2 significant figures)
	function getNiceNumber(value: number): number {
		if (value === 0) return 0;
		const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
		const normalized = value / magnitude;
		
		// Round to nice values: 1, 2, 2.5, 5, 10
		if (normalized <= 1) return magnitude;
		if (normalized <= 2) return 2 * magnitude;
		if (normalized <= 2.5) return 2.5 * magnitude;
		if (normalized <= 5) return 5 * magnitude;
		return 10 * magnitude;
	}
	
	$: validData = data && Array.isArray(data) ? data.filter(d => d && typeof d.value === 'number' && !isNaN(d.value)) : [];
	$: validData2 = data2 && Array.isArray(data2) ? data2.filter(d => d && typeof d.value === 'number' && !isNaN(d.value)) : [];
	$: allData = [...validData, ...validData2];
	$: minValue = allData.length > 0 ? Math.min(...allData.map(d => d.value), 0) : 0;
	$: maxValue = allData.length > 0 ? Math.max(...allData.map(d => d.value), 1) : 100;
	$: niceMin = minValue < 0 ? -getNiceNumber(Math.abs(minValue) * 1.1) : 0;
	$: niceMax = getNiceNumber(maxValue * 1.1); // Add 10% padding
	$: valueRange = niceMax - niceMin;
	$: barWidth = validData2.length > 0 
		? chartWidth / Math.max(validData.length, 1) * 0.3 // Half width when showing two series
		: chartWidth / Math.max(validData.length, 1) * 0.6;
	$: barSpacing = chartWidth / Math.max(validData.length, 1);
	$: zeroY = padding.top + chartHeight - ((0 - niceMin) / valueRange) * chartHeight;
	
	function handleMouseMove(_event: MouseEvent, index: number, series: 1 | 2 = 1) {
		if (!svg) return;
		
		const dataPoint = series === 1 ? validData[index] : validData2[index];
		if (!dataPoint || index >= (series === 1 ? validData.length : validData2.length)) return;
		
		const x = series === 1 
			? padding.left + index * barSpacing + (barSpacing - barWidth * 2) / 2 + barWidth / 2
			: padding.left + index * barSpacing + (barSpacing - barWidth * 2) / 2 + barWidth * 1.5;
		const y = padding.top + chartHeight - ((dataPoint.value - niceMin) / valueRange) * chartHeight;
		
		// Format date for tooltip
		let formattedLabel = dataPoint.label;
		try {
			const dateStr = dataPoint.label.includes('T') ? dataPoint.label : dataPoint.label + 'T00:00:00';
			const date = new Date(dateStr);
			if (!isNaN(date.getTime())) {
				formattedLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
			}
		} catch {
			// Keep original label if date parsing fails
		}
		
		tooltipData = {
			show: true,
			x,
			y: Math.min(y, zeroY),
			value: dataPoint.value,
			label: formattedLabel
		};
	}
	
	function handleMouseLeave() {
		tooltipData.show = false;
	}
</script>

<div class="relative">
	<svg bind:this={svg} {width} {height} xmlns="http://www.w3.org/2000/svg">
		<!-- Background -->
		<rect width={width} height={height} fill="#ffffff" stroke="#f8f4f4" stroke-width="1"/>
		
		<!-- Grid lines -->
		{#if showGrid}
			{#each yTickIndices as _, i (i)}
				<line 
					x1={padding.left} 
					y1={padding.top + i * (chartHeight / 5)} 
					x2={padding.left + chartWidth} 
					y2={padding.top + i * (chartHeight / 5)} 
					stroke="#f8f4f4" 
					stroke-width="1" 
				/>
			{/each}
		{/if}
		
		<!-- Y-axis labels -->
		{#each yTickIndices as _, i (i)}
			{@const value = niceMax - (i / 5) * valueRange}
			{@const absValue = Math.abs(value)}
			{@const formattedValue = absValue >= 1000 ? `${value < 0 ? '-' : ''}${Math.round(absValue / 1000)}k` : Math.round(value).toString()}
			<text 
				x={padding.left - 10} 
				y={padding.top + i * (chartHeight / 5) + 5} 
				text-anchor="end" 
				font-size="12" 
				fill="#666666" 
				font-family="Figtree" 
				font-weight="normal"
			>
				{formattedValue}
			</text>
		{/each}
		
		<!-- X-axis labels -->
		{#if validData.length > 0}
			{@const labelInfo = getLabelsToShow(validData)}
			{#each validData as item, i (item.label + i)}
				{#if labelInfo.indices.includes(i)}
					{@const dateStr = item.label.includes('T') ? item.label : item.label + 'T00:00:00'}
					{@const date = new Date(dateStr)}
					{@const isValidDate = !isNaN(date.getTime())}
					{@const monthLabel = isValidDate ? date.toLocaleDateString('en-US', { month: 'short' }) : item.label}
					{@const year = isValidDate ? date.getFullYear() : ''}
					
					<text 
						x={padding.left + i * barSpacing + barSpacing / 2} 
						y={padding.top + chartHeight + 20} 
						text-anchor="middle" 
						font-size="12" 
						fill="#000000" 
						opacity="0.8"
					>
						{labelInfo.showYear ? monthLabel : year}
					</text>
					
					{#if labelInfo.showYear && isValidDate}
						{@const prevDate = i > 0 ? new Date(validData[i-1].label.includes('T') ? validData[i-1].label : validData[i-1].label + 'T00:00:00') : null}
						{#if i === 0 || !prevDate || isNaN(prevDate.getTime()) || date.getFullYear() !== prevDate.getFullYear()}
							<text 
								x={padding.left + i * barSpacing + barSpacing / 2} 
								y={padding.top + chartHeight + 35} 
								text-anchor="middle" 
								font-size="11" 
								fill="#666666" 
								font-weight="bold"
							>
								{year}
							</text>
						{/if}
					{/if}
				{/if}
			{/each}
		{/if}
		
		<!-- Bars for first series -->
		{#if validData.length > 0}
			{#each validData as item, i (item.label + i)}
				{@const x = validData2.length > 0 
					? padding.left + i * barSpacing + (barSpacing - barWidth * 2) / 2
					: padding.left + i * barSpacing + (barSpacing - barWidth) / 2}
				{@const barHeight = Math.abs((item.value - 0) / valueRange) * chartHeight}
				{@const y = item.value >= 0 
					? zeroY - barHeight
					: zeroY}
				
				<rect 
					x={x} 
					y={y} 
					width={barWidth} 
					height={barHeight}
					fill={barColor}
					on:mousemove={(e) => handleMouseMove(e, i, 1)}
					on:mouseleave={handleMouseLeave}
					class="cursor-pointer hover:opacity-80 transition-opacity duration-200"
					role="button"
					tabindex="0"
					aria-label="{series1Name || 'Series 1'} data point {i + 1}"
				/>
			{/each}
		{/if}
		
		<!-- Bars for second series -->
		{#if validData2.length > 0}
			{#each validData2 as item, i (item.label + i)}
				{@const x = padding.left + i * barSpacing + (barSpacing - barWidth * 2) / 2 + barWidth}
				{@const barHeight = Math.abs((item.value - 0) / valueRange) * chartHeight}
				{@const y = item.value >= 0 
					? zeroY - barHeight
					: zeroY}
				
				<rect 
					x={x} 
					y={y} 
					width={barWidth} 
					height={barHeight}
					fill={barColor2}
					on:mousemove={(e) => handleMouseMove(e, i, 2)}
					on:mouseleave={handleMouseLeave}
					class="cursor-pointer hover:opacity-80 transition-opacity duration-200"
					role="button"
					tabindex="0"
					aria-label="{series2Name || 'Series 2'} data point {i + 1}"
				/>
			{/each}
		{/if}
		
		<!-- Zero line if chart has negative values -->
		{#if minValue < 0}
			<line 
				x1={padding.left} 
				y1={zeroY} 
				x2={padding.left + chartWidth} 
				y2={zeroY} 
				stroke="#000000" 
				stroke-width="1" 
				opacity="0.3"
			/>
		{/if}
		
		<!-- Values on bars (if not using tooltip) -->
		{#if showValues && !tooltipData.show}
			{#each validData as item, i (item.label + i)}
				{@const x = padding.left + i * barSpacing + barSpacing / 2}
				{@const y = padding.top + chartHeight - ((item.value - niceMin) / valueRange) * chartHeight - 10}
				
				<text 
					{x}
					{y}
					text-anchor="middle" 
					font-size="12" 
					font-weight="bold" 
					fill="#000000"
				>
					{Math.round(item.value)}
				</text>
			{/each}
		{/if}
		
		<!-- Title -->
		{#if title}
			<text 
				x={width / 2} 
				y="25" 
				text-anchor="middle" 
				font-size="16" 
				font-weight="bold" 
				fill="#000000" 
				font-family="Figtree"
			>
				{title}
			</text>
		{/if}
		
		<!-- Legend -->
		{#if validData2.length > 0 && (series1Name || series2Name)}
			{@const legendX = width / 2 - 80}
			{@const legendY = height - 40}
			<g transform="translate({legendX}, {legendY})">
				{#if series1Name}
					<rect x="0" y="0" width="12" height="12" fill={barColor}/>
					<text x="16" y="10" font-size="11" fill="#666">{series1Name}</text>
				{/if}
				{#if series2Name}
					<rect x="80" y="0" width="12" height="12" fill={barColor2}/>
					<text x="96" y="10" font-size="11" fill="#666">{series2Name}</text>
				{/if}
			</g>
		{/if}
		
	</svg>
	
	<ChartTooltip
		show={tooltipData.show}
		x={tooltipData.x}
		y={tooltipData.y}
		value={tooltipData.value}
		label={tooltipData.label}
		valuePrefix={valuePrefix}
		valueSuffix={valueSuffix}
	/>
</div>
