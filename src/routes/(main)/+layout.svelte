<script lang="ts">
	import { page } from '$app/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { sftRepository } from '$lib/data/repositories/sftRepository';
	import { sftMetadata, sfts } from '$lib/stores';
	import { web3Modal, signerAddress, connected, loading, disconnectWagmi } from 'svelte-wagmi';
    import { formatAddress } from '$lib/utils/formatters';
    import { slide } from 'svelte/transition';
	import NetworkSelector from '$lib/components/NetworkSelector.svelte';
	
	$: currentPath = $page.url.pathname;
	let mobileMenuOpen = false;
    // Newsletter subscription state
    let newsletterSubmitting = false;
    let newsletterStatus: 'idle' | 'success' | 'error' = 'idle';

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
	async function handleNewsletterSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (newsletterSubmitting) return;

		newsletterSubmitting = true;
		newsletterStatus = 'idle';

		const form = event.currentTarget as HTMLFormElement;
		const formData = new FormData(form);

		try {
			const response = await fetch(form.action, {
				method: 'POST',
				body: formData,
				headers: { Accept: 'application/json' }
			});

			if (response.ok) {
				newsletterStatus = 'success';
				if (typeof form.reset === 'function') {
					form.reset();
				}
			} else {
				newsletterStatus = 'error';
			}
		} catch (error) {
			console.error('Newsletter signup failed:', error);
			newsletterStatus = 'error';
		} finally {
			newsletterSubmitting = false;
			if (typeof window !== 'undefined') {
				const grecaptcha = (window as typeof window & { grecaptcha?: { reset: () => void } }).grecaptcha;
				if (typeof grecaptcha?.reset === 'function') {
					grecaptcha.reset();
				}
			}
		}
	}

	const query = createQuery({
		queryKey: ['getSftMetadata'],
		queryFn: () => {
			return sftRepository.getSftMetadata();
		}
	});
	$: if ($query && $query.data) {
		sftMetadata.set($query.data);
	}

	const vaultQuery = createQuery({
		queryKey: ['getSfts'],
		queryFn: () => {
			return sftRepository.getAllSfts();
		}
	});
	$: if ($vaultQuery && $vaultQuery.data) {
		sfts.set($vaultQuery.data);
	} else if ($vaultQuery && $vaultQuery.isError) {
		// Set to empty array on error to indicate "loaded but failed"
		sfts.set([]);
	}
	

	
	// Enhanced Tailwind class mappings with better mobile responsiveness
	function classNames(...classes: Array<string | false | null | undefined>) {
		return classes.filter(Boolean).join(' ');
	}

	const appClasses = 'min-h-screen flex flex-col';
	const headerClasses = 'border-b border-light-gray bg-white sticky top-0 z-[100]';
	const navContainerClasses = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 sm:h-20 lg:h-24';
	const logoClasses = 'flex items-center gap-1';
	const logoImageClasses = 'h-12 sm:h-14 lg:h-16 w-auto';
	const desktopNavClasses = 'hidden md:flex';
	const navLinksClasses = 'flex gap-6 lg:gap-8 items-center';
	const navLinkClasses = String.raw`relative text-black no-underline font-medium py-2 transition-colors duration-200 touch-target text-sm lg:text-base after:content-["""] after:absolute after:left-0 after:right-0 after:-bottom-2 after:h-1 after:bg-primary after:opacity-0 after:transition-opacity after:duration-200 hover:text-primary hover:no-underline hover:after:opacity-100`;
	const navLinkActiveClasses = 'text-primary after:opacity-100';
	const mobileNavClasses = 'md:hidden fixed top-16 left-0 right-0 bg-white border-b border-light-gray z-[99] shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto';
	const mobileNavLinksClasses = 'flex flex-col p-0 gap-0';
	const mobileNavLinkClasses = 'text-black no-underline font-medium py-4 px-4 sm:px-6 border-b border-light-gray transition-colors duration-200 last:border-b-0 hover:text-primary hover:no-underline hover:bg-light-gray touch-target text-base';
	const mobileNavLinkActiveClasses = 'text-primary bg-light-gray';
	const mainContentClasses = 'flex-1';
	const footerClasses = 'bg-light-gray mt-8 sm:mt-12 lg:mt-16';
	const footerContainerClasses = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 lg:pt-12 pb-4';
	const footerContentClasses = 'grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-12 mb-6 sm:mb-8';
	const footerLogoClasses = 'h-8 sm:h-10 mb-3 sm:mb-4';
	const footerSectionH4Classes = 'typography-h6 mb-3 sm:mb-4 text-black';
	const footerSectionPClasses = 'text-black leading-relaxed text-sm sm:text-base';
	const footerSectionUlClasses = 'list-none p-0';
	const footerSectionLiClasses = 'mb-2';
	const footerSectionLinkClasses = 'text-black no-underline transition-colors duration-200 hover:text-primary text-sm sm:text-base touch-target';
	const footerSocialButtonsClasses = 'flex gap-3 sm:gap-4 mt-3 sm:mt-4 justify-center sm:justify-start';
	const footerSocialBtnClasses = 'flex items-center justify-center w-10 h-10 rounded-full border-2 border-black text-black no-underline transition-colors duration-200 touch-target';
	const footerSocialTwitterClasses = 'hover:border-[#1da1f2] hover:text-[#1da1f2]';
	const footerSocialTelegramClasses = 'hover:border-[#0088cc] hover:text-[#0088cc]';

</script>

<div class={appClasses}>
	<header class={headerClasses}>
		<nav>
			<div class={navContainerClasses}>
				<a href="/" class={classNames(logoClasses, 'z-[102]')} on:click={closeMobileMenu}>
					<div class="overflow-hidden">
						<img src="/assets/logo.svg" alt="Albion Logo" class={logoImageClasses} style="margin-left: -0.3rem" />
					</div>
				</a>
				
				<!-- Desktop navigation - centered -->
				<div class={classNames(navLinksClasses, desktopNavClasses)}>
					<a href="/" class={classNames(navLinkClasses, currentPath === '/' && navLinkActiveClasses)}>Home</a>
					<a href="/assets" class={classNames(navLinkClasses, currentPath.startsWith('/assets') && navLinkActiveClasses)}>Invest</a>
					<a href="/portfolio" class={classNames(navLinkClasses, currentPath === '/portfolio' && navLinkActiveClasses)}>Portfolio</a>
					<a href="/claims" class={classNames(navLinkClasses, currentPath === '/claims' && navLinkActiveClasses)}>Claims</a>
				</div>
				
				<!-- Right side: Network selector + Wallet button + Mobile menu button -->
				<div class="flex items-center gap-2 flex-shrink-0">
					<!-- Network selector -->
					<NetworkSelector />

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
							<span class={classNames('block w-full h-0.5 bg-black transition-all duration-300', mobileMenuOpen && 'rotate-45 translate-y-2')}></span>
							<span class={classNames('block w-full h-0.5 bg-black transition-all duration-300', mobileMenuOpen && 'opacity-0')}></span>
							<span class={classNames('block w-full h-0.5 bg-black transition-all duration-300', mobileMenuOpen && '-rotate-45 -translate-y-2')}></span>
						</div>
					</button>
				</div>
			</div>
			
			<!-- Mobile navigation menu -->
			{#if mobileMenuOpen}
			<div class={mobileNavClasses} transition:slide={{ duration: 300 }}>
				<div class={mobileNavLinksClasses}>
					<a href="/" class={classNames(mobileNavLinkClasses, currentPath === '/' && mobileNavLinkActiveClasses)} on:click={closeMobileMenu}>Home</a>
					<a href="/assets" class={classNames(mobileNavLinkClasses, currentPath.startsWith('/assets') && mobileNavLinkActiveClasses)} on:click={closeMobileMenu}>Invest</a>
					<a href="/portfolio" class={classNames(mobileNavLinkClasses, currentPath === '/portfolio' && mobileNavLinkActiveClasses)} on:click={closeMobileMenu}>Portfolio</a>
					<a href="/claims" class={classNames(mobileNavLinkClasses, currentPath === '/claims' && mobileNavLinkActiveClasses)} on:click={closeMobileMenu}>Claims</a>
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
					<h4 class={footerSectionH4Classes}>Get the latest updates</h4>

					<div class="mt-4">
						<div class="footer-newsletter">
							<div id="mlb2-30848031" class="ml-form-embedContainer ml-subscribe-form ml-subscribe-form-30848031">
								<div class="ml-form-align-center">
									<div class="ml-form-embedWrapper embedForm">
										<div class="ml-form-embedBody ml-form-embedBodyHorizontal row-form">
											<div class="ml-form-embedContent" style="margin: 0"></div>
											{#if newsletterStatus === 'success'}
												<div class="py-4 text-left">
													<p class="text-black font-semibold">Thank you for subscribing.</p>
												</div>
											{:else}
												<form
													class="ml-block-form"
													action="https://assets.mailerlite.com/jsonp/1795576/forms/165459421552445204/subscribe"
													method="post"
													on:submit={handleNewsletterSubmit}
												>
													<div class="ml-form-formContent horozintalForm">
														<div class="ml-form-horizontalRow flex gap-2">
															<div class="ml-input-horizontal flex-1">
																<div class="horizontal-fields" style="width: 100%;">
																	<div class="ml-field-group ml-field-email ml-validate-email ml-validate-required">
																		<input
																			 type="email"
																			 name="fields[email]"
																			 placeholder="Enter email address"
																			 autocomplete="email"
																			 required
																			 class="form-control w-full px-3 py-3 border border-light-gray font-figtree text-sm bg-white text-black transition-colors duration-200 focus:outline-none focus:border-black"
																			 aria-label="Email address"
																		/>
																	</div>
																</div>
															</div>
															<div class="ml-button-horizontal primary" style="display:flex; align-items:stretch; min-width: 120px;">
																<button
																	type="submit"
																	class="px-4 py-3 bg-black text-white border-none font-figtree font-extrabold text-sm uppercase tracking-wider cursor-pointer transition-colors duration-200 hover:bg-secondary whitespace-nowrap w-full disabled:opacity-60 disabled:cursor-not-allowed"
																	disabled={newsletterSubmitting}
																>
																	{newsletterSubmitting ? 'Submitting…' : 'Sign up'}
																</button>
															</div>
														</div>
													</div>

													<!-- Captcha (hidden until email valid via CSS) -->
													<div class="ml-form-recaptcha ml-validate-required" style="float: left; margin-top: 8px;">
														<script src="https://www.google.com/recaptcha/api.js"></script>
														<div class="g-recaptcha" data-sitekey="6Lf1KHQUAAAAAFNKEX1hdSWCS3mRMv4FlFaNslaD"></div>
													</div>

													<input type="hidden" name="ml-submit" value="1" />
													<input type="hidden" name="anticsrf" value="true" />
												</form>
											{/if}
									</div>
									{#if newsletterStatus === 'error'}
										<div class="py-2 text-left">
											<p class="text-sm text-red-600">Something went wrong. Please try again.</p>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
					<div class="mt-3 text-left">
						<a
							href="/legal?tab=privacy"
							target="_blank"
							rel="noopener noreferrer"
							class="text-sm text-black opacity-70 underline hover:text-primary"
						>
							See our Privacy Policy
						</a>
					</div>
				</div>

				<div class="mt-6">
					<h4 class={footerSectionH4Classes}>Connect with us</h4>
					<div class={footerSocialButtonsClasses}>
						<a href="https://x.com/albion_labs" target="_blank" rel="noopener noreferrer" class={classNames(footerSocialBtnClasses, footerSocialTwitterClasses)} aria-label="Follow Albion on X">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
								<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
							</svg>
						</a>
						<a href="https://t.me/albionlabs" target="_blank" rel="noopener noreferrer" class={classNames(footerSocialBtnClasses, footerSocialTelegramClasses)} aria-label="Join Albion on Telegram">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
								<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
							</svg>
						</a>
					</div>
				</div>
			</div>

			<!-- Right Column: Navigation -->
			<div class="flex flex-col lg:order-3">
				<div class="grid grid-cols-2 gap-6 lg:gap-8">
					<div class="lg:text-right">
						<h4 class={classNames(footerSectionH4Classes, 'lg:text-right')}>Platform</h4>
						<ul class={classNames(footerSectionUlClasses, 'lg:text-right')}>
							<li class={footerSectionLiClasses}><a href="/assets" class={footerSectionLinkClasses}>Browse Assets</a></li>
							<li class={footerSectionLiClasses}><a href="/portfolio" class={footerSectionLinkClasses}>Portfolio</a></li>
							<li class={footerSectionLiClasses}><a href="/claims" class={footerSectionLinkClasses}>Claim Payouts</a></li>
						</ul>
					</div>
					<div class="lg:text-right">
						<h4 class={classNames(footerSectionH4Classes, 'lg:text-right')}>Company</h4>
						<ul class={classNames(footerSectionUlClasses, 'lg:text-right')}>
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

<style>
/* Option A: CSS-only hide/show of visible reCAPTCHA until email is valid */
@supports selector(:has(*)) {
  /* Hide reCAPTCHA for footer embed until email valid */
  :global(.footer-newsletter:has(input[name="fields[email]"]) :is(.g-recaptcha, .ml-form-recaptcha, .ml-form-embedReCaptcha, iframe[src*="google.com/recaptcha"])) {
    visibility: hidden;
    opacity: 0;
    max-height: 0;
    pointer-events: none;
    transition: opacity 150ms ease;
  }
  :global(.footer-newsletter:has(input[name="fields[email]"]:valid) :is(.g-recaptcha, .ml-form-recaptcha, .ml-form-embedReCaptcha, iframe[src*="google.com/recaptcha"])) {
    visibility: visible;
    opacity: 1;
    max-height: 120px;
    pointer-events: auto;
  }
}

/* Remove default ML embed background/borders in footer */
.footer-newsletter .ml-form-embedContainer,
.footer-newsletter .ml-form-embedWrapper,
.footer-newsletter .ml-form-embedBody,
.footer-newsletter .row-form { background: transparent; border: 0; box-shadow: none; padding: 0; }

/* Ensure horizontal layout of newsletter form */
.footer-newsletter .ml-form-horizontalRow {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}

.footer-newsletter .ml-input-horizontal {
  flex: 1;
  min-width: 0; /* Allow flexbox to shrink below content width */
}

.footer-newsletter .ml-button-horizontal {
  flex-shrink: 0;
}

/* Mobile responsive: stack on very small screens */
@media (max-width: 480px) {
  .footer-newsletter .ml-form-horizontalRow {
    flex-direction: column;
  }

  .footer-newsletter .ml-button-horizontal {
    width: 100%;
  }
}

</style>
