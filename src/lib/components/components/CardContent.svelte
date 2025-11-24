<script lang="ts">
	export let paddingClass = 'p-8';
	export let overflowClass = 'overflow-auto';

	// Tailwind class mapping
	$: contentClasses = `relative ${paddingClass} ${overflowClass}`;
</script>

<div class={contentClasses}>
	<slot />
</div>