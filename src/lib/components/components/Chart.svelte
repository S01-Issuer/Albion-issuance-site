<script lang="ts">
	import { onMount } from 'svelte';
	import ChartTooltip from './ChartTooltip.svelte';
	
	export let data: Array<{ label: string; value: number }> = [];
	export let width: number = 950;
	export let height: number = 400;
	
	// Responsive dimensions - will be calculated dynamically
	let actualWidth: number;
	let actualHeight: number;
	let isMobile: boolean = false;
	
	// Calculate responsive dimensions
	$: {
		if (typeof window !== 'undefined') {
			isMobile = window.innerWidth < 640;
			actualWidth = isMobile ? Math.min(320, window.innerWidth - 32) : width;
			actualHeight = isMobile ? 200 : height;
		} else {
			actualWidth = width;
			actualHeight = height;
		}
	}
	export let barColor: string = '#08bccc';
	export let valuePrefix: string = '';
	export let valueSuffix: string = '';
	export let title: string = '';
	export let showValues: boolean = false;
export let animate: boolean = true;
export let showGrid: boolean = true;
export let showAreaFill: boolean = true;
export let horizontalLine: { value: number; label: string; color?: string } | null = null;
export let yTickFormat: ((value: number) => string) | null = null;
	
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

	const TICK_COUNT = 6;
	const yTickIndices = Array.from({ length: TICK_COUNT }, (_, i) => i);
	
	// Responsive padding - smaller on mobile
	$: padding = isMobile 
		? { top: 20, right: 10, bottom: 30, left: 40 }
		: { top: 40, right: 20, bottom: 40, left: 60 };
	$: chartWidth = actualWidth - padding.left - padding.right;
	$: chartHeight = actualHeight - padding.top - padding.bottom;
	
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
	$: minValue = validData.length > 0 ? Math.min(...validData.map(d => d.value), horizontalLine?.value || 0, 0) : 0;
	$: maxValue = validData.length > 0 ? Math.max(...validData.map(d => d.value), horizontalLine?.value || 1, 1) : 100;
	$: niceMin = minValue < 0 ? -getNiceNumber(Math.abs(minValue) * 1.1) : 0;
	$: niceMax = getNiceNumber(maxValue * 1.1); // Add 10% padding
	$: valueRange = niceMax - niceMin || 1; // Prevent division by zero
	$: barSpacing = validData.length > 1 ? chartWidth / (validData.length - 1) : chartWidth;
	$: zeroY = padding.top + chartHeight - ((0 - niceMin) / valueRange) * chartHeight;
	
	function handleMouseMove(_event: MouseEvent, index: number) {
		if (!svg || index >= validData.length) return;
		
		const dataPoint = validData[index];
		const x = padding.left + index * barSpacing;
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
			y,
			value: dataPoint.value,
			label: formattedLabel
		};
	}
	
	function handleMouseLeave() {
		tooltipData.show = false;
	}
	
	onMount(() => {
		if (animate && svg) {
			const path = svg.querySelector('.line-path') as SVGPathElement;
			if (path) {
				const length = path.getTotalLength();
				path.style.strokeDasharray = `${length}`;
				path.style.strokeDashoffset = `${length}`;
				path.style.transition = 'stroke-dashoffset 1s ease-in-out';
				setTimeout(() => {
					path.style.strokeDashoffset = '0';
				}, 100);
			}
		}
	});
</script>

<div class="relative w-full overflow-x-auto">
	<svg bind:this={svg} width={actualWidth} height={actualHeight} xmlns="http://www.w3.org/2000/svg" class="max-w-full">
		<!-- Background -->
		<rect width={actualWidth} height={actualHeight} fill="#ffffff" stroke="#f8f4f4" stroke-width="1"/>
		
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
			{@const formattedValue = yTickFormat
				? yTickFormat(value)
				: absValue >= 1000
					? `${value < 0 ? '-' : ''}${Math.round(absValue / 1000)}k`
					: Math.round(value).toString()}
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
						x={padding.left + i * barSpacing} 
						y={padding.top + chartHeight + 20} 
						text-anchor={i === 0 ? "start" : i === validData.length - 1 ? "end" : "middle"} 
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
								x={padding.left + i * barSpacing} 
								y={padding.top + chartHeight + 35} 
								text-anchor={i === 0 ? "start" : i === validData.length - 1 ? "end" : "middle"} 
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
		
		<!-- Line chart -->
		{#if validData.length > 0}
			{@const linePath = validData.map((item, i) => {
				const x = padding.left + i * barSpacing;
				const y = padding.top + chartHeight - ((item.value - niceMin) / valueRange) * chartHeight;
				return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
			}).join(' ')}
			{@const areaPath = linePath + ` L ${padding.left + (validData.length - 1) * barSpacing} ${zeroY} L ${padding.left} ${zeroY} Z`}
			
			<!-- Area fill -->
			{#if showAreaFill}
				<path 
					d={areaPath} 
					fill={barColor} 
					fill-opacity="0.1"
				/>
			{/if}
			
			<!-- Line -->
			<path 
				class="line-path"
				d={linePath} 
				fill="none" 
				stroke={barColor} 
				stroke-width="2"
			/>
			
			<!-- Data points -->
			{#each validData as item, i (item.label + i)}
				{@const x = padding.left + i * barSpacing}
				{@const y = padding.top + chartHeight - ((item.value - niceMin) / valueRange) * chartHeight}
				
				<circle 
					cx={x} 
					cy={y} 
					r="3" 
					fill={barColor}
					on:mousemove={(e) => handleMouseMove(e, i)}
					on:mouseleave={handleMouseLeave}
					class="cursor-pointer hover:r-4 transition-all duration-200"
					role="button"
					tabindex="0"
					aria-label="Data point {i + 1}"
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
		
		<!-- Horizontal reference line -->
		{#if horizontalLine && horizontalLine.value >= niceMin && horizontalLine.value <= niceMax}
			{@const lineY = padding.top + chartHeight - ((horizontalLine.value - niceMin) / valueRange) * chartHeight}
			<line 
				x1={padding.left} 
				y1={lineY} 
				x2={padding.left + chartWidth} 
				y2={lineY} 
				stroke={horizontalLine.color || "#283c84"} 
				stroke-width="2" 
				stroke-dasharray="5,5"
				opacity="0.7"
			/>
			<text 
				x={padding.left + 5} 
				y={lineY - 5} 
				font-size="11" 
				fill={horizontalLine.color || "#283c84"} 
				font-weight="600"
				text-anchor="start"
			>
				{horizontalLine.label} {valuePrefix}{horizontalLine.value.toLocaleString()}{valueSuffix}
			</text>
		{/if}
		
		<!-- Values on bars (if not using tooltip) -->
		{#if showValues && !tooltipData.show}
			{#each validData as item, i (item.label + i)}
				{@const x = padding.left + i * barSpacing}
				{@const y = padding.top + chartHeight - ((item.value - niceMin) / valueRange) * chartHeight - 10}
				
				<text 
					{x}
					{y}
					text-anchor={i === 0 ? "start" : i === validData.length - 1 ? "end" : "middle"} 
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
