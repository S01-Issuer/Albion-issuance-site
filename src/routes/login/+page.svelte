<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { enhance } from '$app/forms';
	export let data: { redirectTo: string };
	let username = '';
	let password = '';
	let error = '';

	let checkbox1 = false;
	let checkbox2 = false;
	let checkbox3 = false;
	$: allChecked = checkbox1 && checkbox2 && checkbox3;
</script>

<div class="min-h-screen bg-white text-slate-900">
	<div
		class="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-16 md:flex-row md:items-start md:gap-16 md:py-24"
	>
		<div class="flex-1">
			<img src="/assets/logo.svg" alt="Albion Labs Logo" class="mb-6 h-24 w-auto" />
			<h1 class="text-3xl font-extrabold tracking-tight md:text-4xl">
				Welcome to Albion Labs
			</h1>
			<p class="mt-4 max-w-2xl text-black">
				Access the royalty token platform to mint, manage, and claim payouts. To comply with regulations, authentication is required.
			</p>
			<p class="mt-2 text-black">
				For access, contact us at
				<a class="text-[#08bccc] underline" href="mailto:contact@albionlabs.org">contact@albionlabs.org</a>.
			</p>
		</div>

		<div class="w-full max-w-md md:pt-8">
			<div class="border-2 border-black bg-white p-6">
				<form
					method="POST"
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'failure') {
								error = 'Invalid username or password.';
							} else if (result.type === 'success' || result.type === 'redirect') {
								window.location.href = data.redirectTo || '/';
							}
						};
					}}
					class="space-y-4"
				>
					<input type="hidden" name="redirectTo" value={data.redirectTo} />
					{#if error}
						<div class="border border-black bg-[#f8f4f4] p-2 text-sm text-black">
							{error}
						</div>
					{/if}
					<div>
						<label for="username" class="mb-1 block text-sm font-bold text-black">Username</label>
						<input
							id="username"
							name="username"
							bind:value={username}
							autocomplete="username"
							class="w-full border-2 border-black bg-white px-3 py-2 text-black placeholder-gray-500 focus:border-[#08bccc] focus:outline-none"
							placeholder="Enter username"
							required
						/>
					</div>
					<div>
						<label for="password" class="mb-1 block text-sm font-bold text-black">Password</label>
						<input
							type="password"
							id="password"
							name="password"
							bind:value={password}
							autocomplete="current-password"
							class="w-full border-2 border-black bg-white px-3 py-2 text-black placeholder-gray-500 focus:border-[#08bccc] focus:outline-none"
							placeholder="Enter password"
							required
						/>
					</div>
					<div class="space-y-3 border-2 border-black bg-[#f8f4f4] p-3">
						<label class="flex items-start gap-3">
							<input
								type="checkbox"
								bind:checked={checkbox1}
								class="mt-1 h-4 w-4 border-2 border-black text-[#08bccc] focus:ring-[#08bccc]"
							/>
							<span class="text-sm text-black"
								>I have read and understood the legal disclaimer and confirm I am not a US Person.</span
							>
						</label>
						<label class="flex items-start gap-3">
							<input
								type="checkbox"
								bind:checked={checkbox2}
								class="mt-1 h-4 w-4 border-2 border-black text-[#08bccc] focus:ring-[#08bccc]"
							/>
							<span class="text-sm text-black"
								>I have read, understood and agree to the <a
									href="/interface-terms"
									target="_blank"
									rel="noopener"
									class="font-bold text-[#283c84] underline hover:text-[#08bccc]">Interface Terms</a
								>.</span
							>
						</label>
						<label class="flex items-start gap-3">
							<input
								type="checkbox"
								bind:checked={checkbox3}
								class="mt-1 h-4 w-4 border-2 border-black text-[#08bccc] focus:ring-[#08bccc]"
							/>
							<span class="text-sm text-black"
								>I have read, understood and agree to the <a
									href="/privacy-policy"
									target="_blank"
									rel="noopener"
									class="font-bold text-[#283c84] underline hover:text-[#08bccc]">Privacy Policy</a
								>.</span
							>
						</label>
					</div>
					<Button class="w-full" disabled={!allChecked}>Agree and enter</Button>
				</form>
			</div>
		</div>
	</div>
</div>
