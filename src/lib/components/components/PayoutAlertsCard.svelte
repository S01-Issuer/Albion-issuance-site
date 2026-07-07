<script lang="ts">
	import { onDestroy } from 'svelte';
	import PrimaryButton from './PrimaryButton.svelte';
	import FormField from './FormField.svelte';
	import {
		getAlertStatus,
		linkAlertEmail,
		unlinkAlertEmail,
		type AlertStatus
	} from '$lib/utils/payoutAlerts';
	import { isPlausibleEmail } from '$lib/utils/payoutAlertsMessage';

	/** Connected wallet address; the card renders nothing without one. */
	export let address: string | null = null;
	/** 'card' = bordered block (claims hero); 'row' = slim single-line entry (portfolio). */
	export let variant: 'card' | 'row' = 'card';

	type Phase = 'loading' | 'unlinked' | 'editing' | 'signing' | 'linked' | 'unavailable';

	let phase: Phase = 'loading';
	let email = '';
	let emailMasked: string | null = null;
	let errorMessage = '';
	let successMessage = '';
	let statusForAddress: string | null = null;
	let destroyed = false;

	onDestroy(() => {
		destroyed = true;
	});

	$: if (address && address !== statusForAddress) {
		statusForAddress = address;
		void refreshStatus(address);
	}

	async function refreshStatus(wallet: string) {
		phase = 'loading';
		errorMessage = '';
		successMessage = '';
		try {
			const status: AlertStatus = await getAlertStatus(wallet);
			if (destroyed || wallet !== statusForAddress) return;
			if (!status.configured) {
				phase = 'unavailable';
				return;
			}
			emailMasked = status.emailMasked;
			phase = status.linked ? 'linked' : 'unlinked';
		} catch {
			if (destroyed || wallet !== statusForAddress) return;
			// Status is a nicety; if it fails, offer signup rather than a dead card.
			phase = 'unlinked';
		}
	}

	async function submitLink() {
		if (!address) return;
		errorMessage = '';
		if (!isPlausibleEmail(email)) {
			errorMessage = 'Please enter a valid email address.';
			return;
		}
		phase = 'signing';
		try {
			const result = await linkAlertEmail(address, email);
			emailMasked = result.emailMasked;
			email = '';
			phase = 'linked';
			successMessage = "You're signed up — we'll email you when a payout lands.";
		} catch (error) {
			console.error('[PayoutAlerts] link failed:', error);
			phase = 'editing';
			errorMessage = isUserRejection(error)
				? 'Signature request was declined — no changes made.'
				: 'Something went wrong signing you up. Please try again.';
		}
	}

	async function submitUnlink() {
		if (!address) return;
		errorMessage = '';
		successMessage = '';
		phase = 'signing';
		try {
			await unlinkAlertEmail(address);
			emailMasked = null;
			phase = 'unlinked';
		} catch (error) {
			console.error('[PayoutAlerts] unlink failed:', error);
			phase = 'linked';
			errorMessage = isUserRejection(error)
				? 'Signature request was declined — no changes made.'
				: 'Something went wrong. Please try again.';
		}
	}

	function isUserRejection(error: unknown): boolean {
		const msg = error instanceof Error ? error.message : String(error);
		return /rejected|denied|cancell?ed/i.test(msg);
	}

	function startEditing() {
		errorMessage = '';
		successMessage = '';
		phase = 'editing';
	}
</script>

{#if address && phase !== 'unavailable' && phase !== 'loading'}
	<div
		class={variant === 'card'
			? 'max-w-md mx-auto mt-6 border border-gray-200 bg-light-gray p-4 text-left'
			: 'flex flex-wrap items-center gap-2 py-2'}
	>
		{#if phase === 'linked'}
			<div class="flex flex-wrap items-center justify-between gap-2 w-full">
				<p class="text-sm text-black">
					<span class="font-bold">Payout alerts on</span>
					— emailing {emailMasked}
				</p>
				<span class="flex gap-3 text-sm">
					<button class="text-secondary underline hover:text-primary" on:click={startEditing}>
						Change
					</button>
					<button class="text-secondary underline hover:text-primary" on:click={submitUnlink}>
						Turn off
					</button>
				</span>
			</div>
			{#if successMessage}
				<p class="text-sm text-green-800 mt-2 w-full">{successMessage}</p>
			{/if}
			{#if errorMessage}
				<p class="text-sm text-red-700 mt-2 w-full">{errorMessage}</p>
			{/if}
		{:else if phase === 'unlinked' && variant === 'row'}
			<p class="text-sm text-black">Get an email when a new payout lands.</p>
			<button class="text-secondary underline hover:text-primary text-sm" on:click={startEditing}>
				Set up payout alerts
			</button>
		{:else}
			<!-- unlinked (card), editing, signing -->
			<p class="text-sm font-bold text-black mb-1">Get payout alerts</p>
			<p class="text-sm text-gray-600 mb-3">
				We'll email you when a new royalty payout is ready to claim. Linking asks your
				wallet for one signature — no transaction, no gas.
			</p>
			<form class="flex flex-wrap items-end gap-2" on:submit|preventDefault={submitLink}>
				<div class="flex-1 min-w-48">
					<FormField
						type="email"
						placeholder="you@example.com"
						bind:value={email}
						size="small"
						disabled={phase === 'signing'}
						error={errorMessage}
					/>
				</div>
				<PrimaryButton type="submit" size="small" disabled={phase === 'signing'}>
					{phase === 'signing' ? 'Check your wallet…' : 'Notify me'}
				</PrimaryButton>
			</form>
		{/if}
	</div>
{/if}
