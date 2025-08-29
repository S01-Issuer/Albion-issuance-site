<script lang="ts">
	import { page } from '$app/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { getSftMetadata } from '$lib/queries/getSftMetadata';
	import { getSfts } from '$lib/queries/getSfts';
	import { sftMetadata, sfts } from '$lib/stores';
	import { onMount } from 'svelte';
	import { web3Modal, signerAddress, connected, loading, disconnectWagmi } from 'svelte-wagmi';
	import { formatAddress } from '$lib/utils/formatters';
	import { slide } from 'svelte/transition';
	
	$: currentPath = $page.url.pathname;
	let mobileMenuOpen = false;
	
	// Real wallet connection
	async function connectWallet() {
		if ($connected && $signerAddress) {
			// Disconnect wallet
			await disconnectWagmi();
			return;
		}
		
		// Open Web3Modal for wallet connection
		$web3Modal.open();
	}
	
	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}
	
	function closeMobileMenu() {
		mobileMenuOpen = false;
	}
	
	function handleSubscribeFormSubmit() {
		// Store the current page path before form submission
		sessionStorage.setItem('lastPageBeforeSubscribe', $page.url.pathname + $page.url.search);
		// The form will handle the actual submission
	}
	
	onMount(() => {
		// Add event listener to the form
		const form = document.getElementById('mc-embedded-subscribe-form');
		if (form) {
			form.addEventListener('submit', handleSubscribeFormSubmit);
		}
		
		// Cleanup
		return () => {
			if (form) {
				form.removeEventListener('submit', handleSubscribeFormSubmit);
			}
		};
	});

	$: query = createQuery({
		queryKey: ['getSftMetadata'],
		queryFn: () => {
			return getSftMetadata();
		}
	});
	$: if ($query && $query.data) {
		sftMetadata.set($query.data);
	}

	$: vaultQuery = createQuery({
		queryKey: ['getSfts'],
		queryFn: () => {
			return getSfts();
		}
	});
	$: if ($vaultQuery && $vaultQuery.data) {
		sfts.set($vaultQuery.data);
	}
	

	
	// Enhanced Tailwind class mappings with better mobile responsiveness
	$: appClasses = 'min-h-screen flex flex-col';
	$: headerClasses = 'border-b border-light-gray bg-white sticky top-0 z-[100]';
	$: navContainerClasses = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 sm:h-20 lg:h-24';
	$: logoClasses = 'flex items-center gap-1';
	$: logoImageClasses = 'h-12 sm:h-14 lg:h-16 w-auto';
	$: desktopNavClasses = 'hidden md:flex';
	$: navLinksClasses = 'flex gap-6 lg:gap-8 items-center';
	$: navLinkClasses = 'text-black no-underline font-medium py-2 relative transition-colors duration-200 hover:text-primary touch-target text-sm lg:text-base';
	$: navLinkActiveClasses = 'text-primary after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-primary';
	$: mobileNavClasses = 'md:hidden fixed top-16 left-0 right-0 bg-white border-b border-light-gray z-[99] shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto';
	$: mobileNavLinksClasses = 'flex flex-col p-0 gap-0';
	$: mobileNavLinkClasses = 'text-black no-underline font-medium py-4 px-4 sm:px-6 border-b border-light-gray transition-colors duration-200 last:border-b-0 hover:text-primary hover:bg-light-gray touch-target text-base';
	$: mobileNavLinkActiveClasses = 'text-primary bg-light-gray';
	$: mainContentClasses = 'flex-1';
	$: footerClasses = 'bg-light-gray mt-8 sm:mt-12 lg:mt-16';
	$: footerContainerClasses = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 lg:pt-12 pb-4';
	$: footerContentClasses = 'grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-12 mb-6 sm:mb-8';
	$: footerLogoClasses = 'h-8 sm:h-10 mb-3 sm:mb-4';
	$: footerSectionH4Classes = 'typography-h6 mb-3 sm:mb-4 text-black';
	$: footerSectionPClasses = 'text-black leading-relaxed text-sm sm:text-base';
	$: footerSectionUlClasses = 'list-none p-0';
	$: footerSectionLiClasses = 'mb-2';
	$: footerSectionLinkClasses = 'text-black no-underline transition-colors duration-200 hover:text-primary text-sm sm:text-base touch-target';
	$: footerSocialButtonsClasses = 'flex gap-3 sm:gap-4 mt-3 sm:mt-4 justify-center sm:justify-start';
	$: footerSocialBtnClasses = 'flex items-center justify-center w-10 h-10 rounded-full border-2 border-black text-black no-underline transition-colors duration-200 touch-target';
	$: footerSocialTwitterClasses = 'hover:border-[#1da1f2] hover:text-[#1da1f2]';
	$: footerSocialLinkedinClasses = 'hover:border-[#0077b5] hover:text-[#0077b5]';
	$: footerSocialTelegramClasses = 'hover:border-[#0088cc] hover:text-[#0088cc]';
	$: footerSocialDiscordClasses = 'hover:border-[#5865f2] hover:text-[#5865f2]';
</script>

<div class={appClasses}>
	<header class={headerClasses}>
		<nav>
			<div class={navContainerClasses}>
				<a href="/" class="{logoClasses} z-[102]" on:click={closeMobileMenu}>
					<div class="overflow-hidden">
						<img src="/assets/logo.svg" alt="Albion Logo" class={logoImageClasses} style="margin-left: -0.3rem" />
					</div>
				</a>
				
				<!-- Desktop navigation - centered -->
				<div class="{navLinksClasses} {desktopNavClasses}">
					<a href="/" class="{navLinkClasses} {currentPath === '/' ? navLinkActiveClasses : ''}">Home</a>
					<a href="/assets" class="{navLinkClasses} {currentPath.startsWith('/assets') ? navLinkActiveClasses : ''}">Invest</a>
					<a href="/portfolio" class="{navLinkClasses} {currentPath === '/portfolio' ? navLinkActiveClasses : ''}">Portfolio</a>
					<a href="/claims" class="{navLinkClasses} {currentPath === '/claims' ? navLinkActiveClasses : ''}">Claims</a>
				</div>
				
				<!-- Right side: Wallet button + Mobile menu button -->
				<div class="flex items-center gap-2 flex-shrink-0">
					<!-- Wallet button (responsive for both desktop and mobile) -->
					<button 
						class="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm bg-white border border-light-gray rounded hover:bg-light-gray hover:border-secondary transition-all duration-200"
						on:click={connectWallet}
						disabled={$loading}
					>
						{#if $loading}
							<svg class="w-3 h-3 sm:w-4 sm:h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
							<span class="hidden sm:inline">Connecting...</span>
							<span class="sm:hidden">...</span>
						{:else if $connected && $signerAddress}
							<svg class="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
							</svg>
							<span class="hidden sm:inline">{formatAddress($signerAddress)}</span>
							<span class="sm:hidden">{formatAddress($signerAddress).split('...')[0]}...</span>
						{:else}
							<svg class="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
							</svg>
							<span>Connect</span>
						{/if}
					</button>
					
					<!-- Mobile menu button -->
					<button class="md:hidden bg-transparent border-none cursor-pointer p-2 z-[101] relative flex-shrink-0 w-10 h-10 flex items-center justify-center" on:click={toggleMobileMenu} aria-label="Toggle menu">
						<div class="w-6 h-5 relative flex flex-col justify-between">
							<span class="block w-full h-0.5 bg-black transition-all duration-300 {mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}"></span>
							<span class="block w-full h-0.5 bg-black transition-all duration-300 {mobileMenuOpen ? 'opacity-0' : ''}"></span>
							<span class="block w-full h-0.5 bg-black transition-all duration-300 {mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}"></span>
						</div>
					</button>
				</div>
			</div>
			
			<!-- Mobile navigation menu -->
			{#if mobileMenuOpen}
			<div class={mobileNavClasses} transition:slide={{ duration: 300 }}>
				<div class={mobileNavLinksClasses}>
					<a href="/" class="{mobileNavLinkClasses} {currentPath === '/' ? mobileNavLinkActiveClasses : ''}" on:click={closeMobileMenu}>Home</a>
					<a href="/assets" class="{mobileNavLinkClasses} {currentPath.startsWith('/assets') ? mobileNavLinkActiveClasses : ''}" on:click={closeMobileMenu}>Invest</a>
					<a href="/portfolio" class="{mobileNavLinkClasses} {currentPath === '/portfolio' ? mobileNavLinkActiveClasses : ''}" on:click={closeMobileMenu}>Portfolio</a>
					<a href="/claims" class="{mobileNavLinkClasses} {currentPath === '/claims' ? mobileNavLinkActiveClasses : ''}" on:click={closeMobileMenu}>Claims</a>
				</div>
			</div>
			{/if}
		</nav>
	</header>

	<main class={mainContentClasses}>
		<slot />
	</main>

	<footer class={footerClasses}>
		<div class={footerContainerClasses}>
			<div class={footerContentClasses}>
				<!-- Left Column: Brand -->
				<div class="flex flex-col">
					<div class="overflow-hidden mb-3 sm:mb-4">
						<img src="/assets/footer.svg" alt="Albion" class={footerLogoClasses} style="margin-left: -0.18rem" />
					</div>
					<p class={footerSectionPClasses}>Tokenized oil field investments</p>
					<p class="text-black text-sm mt-4">&copy; 2025 Albion. All rights reserved.</p>
				</div>

				<!-- Middle Column: Newsletter & Social -->
				<div class="flex flex-col lg:order-2">
					<h4 class={footerSectionH4Classes}>Sign up updates</h4>
					
					<!-- MailChimp Newsletter Signup Form -->
					<div id="mc_embed_signup" class="mt-4">
						<form action="https://exchange.us7.list-manage.com/subscribe/post?u=f3b19322aa5fe51455b292838&amp;id=6eaaa49162&amp;f_id=00fd53e0f0" 
							  method="post" id="mc-embedded-subscribe-form" name="mc-embedded-subscribe-form" target="_self" novalidate>
							<div id="mc_embed_signup_scroll" class="flex gap-2">
								<input type="email" value="" name="EMAIL" 
									   placeholder="Enter email address"
									   id="mce-EMAIL" required
									   class="flex-1 px-3 py-3 border border-light-gray font-figtree text-sm bg-white text-black transition-colors duration-200 focus:outline-none focus:border-black"
								/>
								<!-- Hidden field for notification type -->
								<input type="hidden" name="MMERGE9" value="newsletter" />
								<!-- real people should not fill this in and expect good things - do not remove this or risk form bot signups-->
								<div style="position: absolute; left: -5000px;" aria-hidden="true">
									<input type="text" name="b_f3b19322aa5fe51455b292838_6eaaa49162" tabindex="-1" value="">
								</div>
								<input type="submit" value="Sign up" name="subscribe" id="mc-embedded-subscribe"
									   class="px-4 py-3 bg-black text-white border-none font-figtree font-extrabold text-sm uppercase tracking-wider cursor-pointer transition-colors duration-200 hover:bg-secondary whitespace-nowrap"
								/>
							</div>
							<div id="mce-responses" class="clear">
								<div class="response" id="mce-error-response" style="display: none;"></div>
								<div class="response" id="mce-success-response" style="display: none;"></div>
							</div>
						</form>
					</div>

					<div class="mt-6">
						<h4 class={footerSectionH4Classes}>Connect with us</h4>
						<div class={footerSocialButtonsClasses}>
							<a href="https://x.com/albion_labs" target="_blank" rel="noopener noreferrer" class="{footerSocialBtnClasses} {footerSocialTwitterClasses}" aria-label="Follow Albion on X">
								<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
									<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
								</svg>
							</a>
							<a href="https://t.me/albionlabs" target="_blank" rel="noopener noreferrer" class="{footerSocialBtnClasses} {footerSocialTelegramClasses}" aria-label="Join Albion on Telegram">
								<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
									<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
								</svg>
							</a>
						</div>
					</div>
				</div>

				<!-- Right Column: Navigation -->
				<div class="flex flex-col lg:order-3">
					<div class="grid grid-cols-2 gap-6 lg:gap-8">
						<div class="lg:text-right">
							<h4 class="{footerSectionH4Classes} lg:text-right">Platform</h4>
							<ul class="{footerSectionUlClasses} lg:text-right">
								<li class={footerSectionLiClasses}><a href="/assets" class={footerSectionLinkClasses}>Browse Assets</a></li>
								<li class={footerSectionLiClasses}><a href="/portfolio" class={footerSectionLinkClasses}>Portfolio</a></li>
								<li class={footerSectionLiClasses}><a href="/claims" class={footerSectionLinkClasses}>Claim Payouts</a></li>
							</ul>
						</div>
						<div class="lg:text-right">
							<h4 class="{footerSectionH4Classes} lg:text-right">Company</h4>
							<ul class="{footerSectionUlClasses} lg:text-right">
								<li class={footerSectionLiClasses}><a href="/about" class={footerSectionLinkClasses}>About</a></li>
								<li class={footerSectionLiClasses}><a href="/support" class={footerSectionLinkClasses}>Support</a></li>
								<li class={footerSectionLiClasses}><a href="/legal" class={footerSectionLinkClasses}>Legal</a></li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	</footer>
</div>



