<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { PageLayout, HeroSection, ContentSection } from '$lib/components/layout';
	import { PrimaryButton, SecondaryButton, SectionTitle } from '$lib/components/components';
	
	let redirectUrl = '/';
	
	onMount(() => {
		// Check if there's a return URL in the query params
		const returnUrl = $page.url.searchParams.get('return');
		
		// If no return URL, check sessionStorage for the last visited page
		if (returnUrl) {
			// Validate the URL to prevent open redirects
			try {
				const url = new URL(returnUrl, window.location.origin);
				// Only allow internal redirects
				if (url.origin === window.location.origin) {
					redirectUrl = url.pathname + url.search + url.hash;
				}
			} catch {
				// If URL parsing fails, use the returnUrl as a pathname
				if (returnUrl.startsWith('/')) {
					redirectUrl = returnUrl;
				}
			}
		} else {
			// Try to get the last page from sessionStorage
			const lastPage = sessionStorage.getItem('lastPageBeforeSubscribe');
			if (lastPage && lastPage.startsWith('/')) {
				redirectUrl = lastPage;
			} else {
				// If no stored page, check the referrer
				const referrer = document.referrer;
				if (referrer && referrer.includes(window.location.origin)) {
					try {
						const referrerUrl = new URL(referrer);
						if (referrerUrl.origin === window.location.origin) {
							redirectUrl = referrerUrl.pathname + referrerUrl.search + referrerUrl.hash;
						}
					} catch {
						// Keep default redirect
					}
				}
			}
		}
	});
	
	function handleReturn() {
		// Clear the stored last page
		sessionStorage.removeItem('lastPageBeforeSubscribe');
		goto(redirectUrl);
	}
</script>

<svelte:head>
	<title>Thank You - Albion</title>
	<meta name="description" content="Thank you for subscribing to Albion updates" />
</svelte:head>

<PageLayout>
	<HeroSection 
		title="Thank You for Subscribing!"
		subtitle="You've been successfully added to our mailing list. We'll keep you updated on new investment opportunities and platform updates."
		showBorder={true}
		showButtons={false}
	/>
	
	<ContentSection background="gray" padding="standard" centered>
		<SectionTitle level="h2" size="section" center className="mb-8">Join Our Community</SectionTitle>
		<p class="text-black opacity-70 mb-8 max-w-xl mx-auto">
			Stay connected and get the latest updates on Albion
		</p>
		<div class="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
			<PrimaryButton href="https://t.me/albionlabs" size="medium">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="mr-2">
					<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
				</svg>
				Updates Channel
			</PrimaryButton>
			<span class="text-black">or</span>
			<SecondaryButton href="https://t.me/+rw9m7NqlTfhhN2I8" size="medium">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="mr-2">
					<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
				</svg>
				Community Chat
			</SecondaryButton>
		</div>
		<PrimaryButton on:click={handleReturn} size="large">
			Continue Browsing
		</PrimaryButton>
	</ContentSection>
</PageLayout>