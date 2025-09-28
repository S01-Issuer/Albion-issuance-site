<script lang="ts">
	import { onMount } from 'svelte';
	import ChartTooltip from './ChartTooltip.svelte';
	
	export let data: Array<{
		label: string;
		value: number;
		percentage: number;
	}> = [];
	export let width: number = 300;
	export let height: number = 300;
	export let colors: string[] = [
		'#08bccc', // Primary blue
		'#283c84', // Secondary blue
		'#0a8a96', // Darker primary
		'#1a2557', // Darker secondary
		'#35D1DC', // Lighter primary
		'#4A5BA7', // Lighter secondary
		'#7CE8F5', // Very light primary
		'#8899CC', // Very light secondary
	];
	export let showLabels: boolean = true;
	export let showLegend: boolean = true;
	export let animate: boolean = true;
	export let valuePrefix: string = '$';
	export let innerRadius: number = 0; // 0 for pie, > 0 for donut
	
	let svg: SVGSVGElement;
	let tooltipData = {
		show: false,
		x: 0,
		y: 0,
		value: 0,
		label: '',
		percentage: 0
	};
	
	const centerX = width / 2;
	const centerY = height / 2;
	const outerRadius = Math.min(width, height) / 2 - 10;
	const labelRadius = outerRadius * 0.7;
	
	// Calculate pie segments
	$: pieData = (() => {
		if (!data || !Array.isArray(data) || data.length === 0) return [];
		
		// Filter out invalid data and ensure percentages are valid
		const validData = data.filter(item => 
			item && 
			typeof item.percentage === 'number' && 
			!isNaN(item.percentage) && 
			item.percentage > 0 &&
			typeof item.value === 'number' &&
			!isNaN(item.value) &&
			item.value >= 0 &&
			item.label &&
			typeof item.label === 'string'
		);
		
		if (validData.length === 0) return [];
		
		// Normalize percentages to ensure they sum to 100
		const totalPercentage = validData.reduce((sum, item) => sum + item.percentage, 0);
		const normalizedData = totalPercentage > 0 
			? validData.map(item => ({ ...item, percentage: (item.percentage / totalPercentage) * 100 }))
			: validData;
		
		let currentAngle = -Math.PI / 2; // Start at top
		return normalizedData.map((item, index) => {
			const startAngle = currentAngle;
			const endAngle = currentAngle + (item.percentage / 100) * 2 * Math.PI;
			currentAngle = endAngle;
			
			const midAngle = (startAngle + endAngle) / 2;
			const labelX = centerX + Math.cos(midAngle) * labelRadius;
			const labelY = centerY + Math.sin(midAngle) * labelRadius;
			
			return {
				...item,
				startAngle,
				endAngle,
				midAngle,
				labelX,
				labelY,
				color: colors[index % colors.length],
				path: createPath(startAngle, endAngle)
			};
		});
	})();
	
	function createPath(startAngle: number, endAngle: number): string {
		const angleDiff = endAngle - startAngle;
		const isFullCircle = angleDiff >= Math.PI * 2 - 0.0001;
		const largeArcFlag = angleDiff > Math.PI ? 1 : 0;
		
		const x1 = centerX + Math.cos(startAngle) * outerRadius;
		const y1 = centerY + Math.sin(startAngle) * outerRadius;
		const x2 = centerX + Math.cos(endAngle) * outerRadius;
		const y2 = centerY + Math.sin(endAngle) * outerRadius;
		
		if (innerRadius > 0) {
			if (isFullCircle) {
				return `
					M ${centerX + outerRadius} ${centerY}
					A ${outerRadius} ${outerRadius} 0 1 0 ${centerX - outerRadius} ${centerY}
					A ${outerRadius} ${outerRadius} 0 1 0 ${centerX + outerRadius} ${centerY}
					M ${centerX + innerRadius} ${centerY}
					A ${innerRadius} ${innerRadius} 0 1 1 ${centerX - innerRadius} ${centerY}
					A ${innerRadius} ${innerRadius} 0 1 1 ${centerX + innerRadius} ${centerY}
					Z
				`;
			}
			
			const ix1 = centerX + Math.cos(startAngle) * innerRadius;
			const iy1 = centerY + Math.sin(startAngle) * innerRadius;
			const ix2 = centerX + Math.cos(endAngle) * innerRadius;
			const iy2 = centerY + Math.sin(endAngle) * innerRadius;
			
			return `
				M ${x1} ${y1}
				A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}
				L ${ix2} ${iy2}
				A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${ix1} ${iy1}
				Z
			`;
		}
		
		if (isFullCircle) {
			return `
				M ${centerX} ${centerY}
				m ${-outerRadius} 0
				a ${outerRadius} ${outerRadius} 0 1 0 ${outerRadius * 2} 0
				a ${outerRadius} ${outerRadius} 0 1 0 ${-outerRadius * 2} 0
				Z
			`;
		}
		
		return `
			M ${centerX} ${centerY}
			L ${x1} ${y1}
			A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}
			Z
		`;
	}
	
	function handleMouseMove(event: MouseEvent, segment: any) {
		if (!svg) return;
		
		const rect = svg.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		
		tooltipData = {
			show: true,
			x,
			y,
			value: segment.value || 0,
			label: segment.label || '',
			percentage: segment.percentage || 0
		};
	}
	
	function handleMouseLeave() {
		tooltipData.show = false;
	}
	
	onMount(() => {
		if (animate && svg) {
			const paths = svg.querySelectorAll('.pie-segment');
			paths.forEach((path, index) => {
				const pathElement = path as SVGPathElement;
				pathElement.style.transform = 'scale(0)';
				pathElement.style.transformOrigin = `${centerX}px ${centerY}px`;
				pathElement.style.transition = `transform 0.5s ease-out ${index * 0.1}s`;
				setTimeout(() => {
					pathElement.style.transform = 'scale(1)';
				}, 100);
			});
		}
	});
</script>

<div class="relative inline-block">
	<svg bind:this={svg} {width} {height} xmlns="http://www.w3.org/2000/svg">
		<!-- Pie segments -->
		{#each pieData as segment, i}
			<path
				class="pie-segment cursor-pointer hover:opacity-80 transition-opacity duration-200"
				d={segment.path}
				fill={segment.color}
				stroke="#ffffff"
				stroke-width="2"
				fill-rule="evenodd"
				on:mousemove={(e) => handleMouseMove(e, segment)}
				on:mouseleave={handleMouseLeave}
				role="button"
				tabindex="0"
				aria-label="{segment.label}: {(segment.percentage || 0).toFixed(1)}%"
			/>
		{/each}
		
		<!-- Labels on segments -->
		{#if showLabels}
			{#each pieData as segment}
				{#if segment.percentage >= 5 && !isNaN(segment.percentage) && segment.percentage != null}
					<text
						x={segment.labelX}
						y={segment.labelY}
						text-anchor="middle"
						dominant-baseline="middle"
						font-size="14"
						font-weight="bold"
						fill="#ffffff"
						pointer-events="none"
						style="text-shadow: 0 1px 2px rgba(0,0,0,0.3)"
					>
						{(segment.percentage || 0).toFixed(0)}%
					</text>
				{/if}
			{/each}
		{/if}
	</svg>
	
	<!-- Legend -->
	{#if showLegend}
		<div class="mt-4">
			<div class="flex flex-wrap gap-x-4 gap-y-2 justify-center">
				{#each pieData as segment}
					<div class="flex items-center gap-2">
						<div 
							class="w-3 h-3 rounded-sm flex-shrink-0"
							style="background-color: {segment.color}"
						></div>
						<span class="text-xs font-medium text-black">
							{segment.label}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
	
	<!-- Tooltip -->
	{#if tooltipData.show}
		<div 
			class="absolute z-50 bg-black text-white p-3 rounded text-sm pointer-events-none"
			style="left: {tooltipData.x}px; top: {tooltipData.y - 60}px; transform: translateX(-50%);"
		>
			<div class="font-bold">{tooltipData.label}</div>
			<div>{valuePrefix}{(tooltipData.value || 0).toLocaleString()}</div>
			<div class="text-xs opacity-80">{(tooltipData.percentage || 0).toFixed(1)}% of portfolio</div>
		</div>
	{/if}
</div>

<style>
	/* Add any component-specific styles here if needed */
</style>
