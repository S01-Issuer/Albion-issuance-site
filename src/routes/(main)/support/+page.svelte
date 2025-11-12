<script lang="ts">
	import SectionTitle from '$lib/components/components/SectionTitle.svelte';
	import { PageLayout, HeroSection, ContentSection } from '$lib/components/layout';
</script>

<svelte:head>
	<title>Support - Albion</title>
	<meta name="description" content="Get help with the Albion investment platform, browse our FAQs, and find support resources" />
</svelte:head>

<PageLayout>
	<!-- Hero Section -->
	<HeroSection 
		title="Support Center"
		subtitle="Find the answers to your questions, browse our knowledge base, and get the help you need."
		showBorder={true}
	/>


	<!-- FAQ Section -->
	<ContentSection background="white" padding="standard" centered>
		<SectionTitle level="h2" size="section" center className="mb-12">Frequently Asked Questions</SectionTitle>

		<div class="grid grid-cols-1 gap-8 max-w-4xl mx-auto">
			<!-- Q1: Gas Fees -->
			<div class="bg-light-gray p-8 text-left border-b-4 border-primary rounded">
				<SectionTitle level="h3" size="small" uppercase className="mb-4">I need to pay gas fees to buy tokens or claim yield. What do I do?</SectionTitle>
				<div class="text-sm text-black space-y-3">
					<p>Gas fees are small transaction costs required by the blockchain network. Here's how to get ETH on Base:</p>
					<ol class="list-decimal list-inside space-y-2 ml-2">
						<li><strong>Get ETH on Ethereum mainnet:</strong> Purchase ETH from a centralized exchange (like Coinbase, Kraken, or Gemini) and withdraw it to your wallet address.</li>
						<li><strong>Bridge ETH to Base:</strong> Use the official Base bridge (bridge.base.org) to transfer your ETH from Ethereum to the Base network. This is a one-way bridge that takes about 5-10 minutes.</li>
						<li><strong>Confirm you're on Base:</strong> Make sure your wallet is connected to the Base network (not Ethereum mainnet) when making purchases or claims.</li>
					</ol>
					<p class="pt-2"><em>Note: You only need a small amount of ETH (usually $1-5 worth) to cover gas fees for multiple transactions.</em></p>
				</div>
			</div>

			<!-- Q2: Payment Method -->
			<div class="bg-light-gray p-8 text-left border-b-4 border-primary rounded">
				<SectionTitle level="h3" size="small" uppercase className="mb-4">How do I pay for tokens?</SectionTitle>
				<div class="text-sm text-black space-y-3">
					<p>Tokens are purchased using USDC stablecoin on the Base network. Here's what you need:</p>
					<ul class="list-disc list-inside space-y-2 ml-2">
						<li><strong>USDC on Base:</strong> You must have USDC (USD Coin) on the Base network, not on Ethereum mainnet.</li>
						<li><strong>Getting USDC:</strong> Purchase USDC from a centralized exchange and bridge it to Base, or swap ETH for USDC on Base using decentralized exchanges like Uniswap.</li>
						<li><strong>Network confirmation:</strong> Always verify you're connected to the Base network in your wallet before attempting to purchase.</li>
						<li><strong>Gas fees:</strong> You'll also need a small amount of ETH on Base to pay for transaction fees (see the gas fees question above).</li>
					</ul>
				</div>
			</div>

			<!-- Q3: Yield Claims -->
			<div class="bg-light-gray p-8 text-left border-b-4 border-primary rounded">
				<SectionTitle level="h3" size="small" uppercase className="mb-4">How do I actually get my yield?</SectionTitle>
				<div class="text-sm text-black space-y-3">
					<p>Yield from royalty tokens is distributed through a secure smart contract system:</p>
					<ol class="list-decimal list-inside space-y-2 ml-2">
						<li><strong>Yield availability:</strong> When yield is generated from an asset, the royalty provider deposits the funds into a smart contract associated with that token.</li>
						<li><strong>Claiming your yield:</strong> Visit the <a href="/claims" class="text-primary font-semibold hover:text-secondary transition-colors">Claims page</a> in your account to view available payouts.</li>
						<li><strong>One-click claiming:</strong> Click "Claim" on any available yield amount to transfer funds directly to your connected wallet.</li>
						<li><strong>Check your portfolio:</strong> Your claimed amounts will be updated in real-time on your <a href="/portfolio" class="text-primary font-semibold hover:text-secondary transition-colors">Portfolio page</a>.</li>
					</ol>
					<p class="pt-2"><em>Note: You'll need a small amount of ETH on Base to pay the gas fee for claiming (typically a few cents).</em></p>
				</div>
			</div>

			<!-- Q4: Tokens in Wallet -->
			<div class="bg-light-gray p-8 text-left border-b-4 border-primary rounded">
				<SectionTitle level="h3" size="small" uppercase className="mb-4">Why can't I see my tokens in my wallet?</SectionTitle>
				<div class="text-sm text-black space-y-3">
					<p>If your purchased tokens aren't showing up in your wallet, here are the most common reasons and solutions:</p>
					<ol class="list-decimal list-inside space-y-2 ml-2">
						<li><strong>Wrong network:</strong> Make sure your wallet is set to the Base network, not Ethereum mainnet. Switch networks in your wallet settings if needed.</li>
						<li><strong>Token not added:</strong> Most wallets don't automatically display custom tokens. You need to manually add the token using its contract address:
							<ul class="list-disc list-inside ml-4 mt-2 space-y-1">
								<li>Go to the Assets page and click on the token you purchased</li>
								<li>Copy the contract address from the asset details</li>
								<li>In your wallet, select "Add Token" and paste the contract address</li>
								<li>The token should now appear in your wallet balance</li>
							</ul>
						</li>
						<li><strong>Token whitelists:</strong> Some wallet token lists only display tokens that are verified on major whitelists. Royalty tokens may not appear in the default list since they are custom tokens tied to specific assets. This doesn't affect ownership or utility—your tokens are secure in your wallet even if not listed by default.</li>
					</ol>
					<p class="pt-2"><em>Your tokens are always owned by your wallet, even if they don't display automatically. Adding the token address simply enables your wallet to show the balance.</em></p>
				</div>
			</div>
		</div>
	</ContentSection>

	<!-- Still Need Help Section -->
	<ContentSection background="gray" padding="standard" centered>
		<SectionTitle level="h2" size="section" center className="mb-8">Still need help?</SectionTitle>
		<div class="flex flex-col sm:flex-row gap-6 justify-center items-center">
			<a href="mailto:contact@albionlabs.org" class="text-primary font-semibold text-lg no-underline hover:opacity-80 transition-opacity duration-200">
				contact@albionlabs.org
			</a>
			<span class="text-black">or</span>
			<a href="https://t.me/+rw9m7NqlTfhhN2I8" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white font-semibold no-underline rounded-lg hover:bg-secondary transition-colors duration-200">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
					<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
				</svg>
				Join our Telegram
			</a>
		</div>
	</ContentSection>

	<!-- Support Resources -->
	<ContentSection background="secondary" padding="standard" centered>
		<SectionTitle level="h2" size="section" center className="mb-12 text-white">Support Resources</SectionTitle>
		
		<div class="grid grid-cols-1 gap-8">
			<span></span>	
			<div class="text-3xl mb-4">🚧 This section under construction</div>
			<span></span>	
		</div>
	</ContentSection>
</PageLayout>

