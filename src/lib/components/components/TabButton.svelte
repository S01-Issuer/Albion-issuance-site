<script lang="ts">
	export let active = false;
	export let disabled = false;

const baseClasses = `px-8 py-4 font-semibold text-sm uppercase tracking-wider transition-colors duration-200 inline-block border-b-2 border-transparent no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`;
$: classes = active
  ? `${baseClasses} bg-secondary border-secondary text-white`
  : `${baseClasses} text-black hover:text-secondary hover:border-secondary`;
</script>

<button
	class={classes}
	{disabled}
	on:click
	on:keydown
>
	<slot />
</button>
