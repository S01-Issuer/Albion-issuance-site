<script lang="ts">
	export let disabled = false;
	export let type: 'button' | 'submit' | 'reset' = 'submit';
	let className = '';
	export { className as class };
</script>

<button
	{type}
	{disabled}
	class="bg-[#08bccc] px-6 py-3 font-bold text-white transition-colors hover:bg-[#283c84] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 {className}"
	on:click
>
	<slot />
</button>