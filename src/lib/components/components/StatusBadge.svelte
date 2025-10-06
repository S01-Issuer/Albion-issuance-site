<script lang="ts">
	export let status: string;
	export let variant: 'default' | 'producing' | 'funding' | 'completed' | 'available' | 'claimed' | 'pending' = 'default';
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let uppercase: boolean = true;
	export let showIcon: boolean = false;
	export let animated: boolean = false;

	// Auto-detect variant from status if not explicitly set
	$: computedVariant = variant === 'default' ? getVariantFromStatus(status) : variant;
	
	// Size class mappings
	const sizeClasses = {
		small: 'px-1.5 py-0.5 text-[0.6rem]',
		medium: 'px-2 py-1 text-[0.7rem]',
		large: 'px-3 py-1.5 text-xs'
	};
	
	// Variant class mappings
const variantClasses = {
	default: 'bg-light-gray text-secondary',
	producing: 'bg-green-100 text-green-600 border border-green-200',
	funding: 'bg-yellow-100 text-yellow-600 border border-yellow-200',
	completed: 'bg-light-gray text-primary border border-primary',
	available: 'bg-blue-100 text-primary border border-blue-300',
	claimed: 'bg-green-100 text-green-600 border border-green-200',
	pending: 'bg-gray-100 text-gray-600 border border-gray-300'
};

const shineEffectClasses = 'absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shine_2s_infinite] motion-reduce:animate-none';

function classNames(...classes: Array<string | false | null | undefined>) {
	return classes.filter(Boolean).join(' ');
}

function badgeClass() {
	return classNames(
		'inline-flex items-center gap-1 font-bold whitespace-nowrap rounded-none',
		uppercase && 'uppercase tracking-wide',
		sizeClasses[size],
		variantClasses[computedVariant],
		animated && computedVariant === 'producing' && 'relative overflow-hidden'
	);
}

function iconClass() {
	return classNames(
		'text-[0.8em]',
		computedVariant === 'producing' && 'animate-[pulse-status_2s_infinite] motion-reduce:animate-none'
	);
}

	function getVariantFromStatus(status: string): typeof variant {
		if (!status) return 'default';
		const statusLower = status.toLowerCase();
		if (statusLower.includes('producing')) return 'producing';
		if (statusLower.includes('funding')) return 'funding';
		if (statusLower.includes('completed')) return 'completed';
		if (statusLower.includes('available')) return 'available';
		if (statusLower.includes('claimed')) return 'claimed';
		if (statusLower.includes('pending')) return 'pending';
		return 'default';
	}

	function getIcon(variant: string): string {
		switch (variant) {
			case 'producing': return '●';
			case 'funding': return '◐';
			case 'completed': return '✓';
			case 'available': return '◯';
			case 'claimed': return '✓';
			case 'pending': return '⏳';
			default: return '●';
		}
	}
</script>

<span class={badgeClass()}>
	{#if animated && computedVariant === 'producing'}
		<span class={shineEffectClasses}></span>
	{/if}
	{#if showIcon}
		<span class={iconClass()}>{getIcon(computedVariant)}</span>
	{/if}
	{uppercase ? (status || '').toUpperCase() : (status || '')}
</span>
