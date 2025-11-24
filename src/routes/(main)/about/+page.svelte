<script lang="ts">
	import SectionTitle from '$lib/components/components/SectionTitle.svelte';
	import PrimaryButton from '$lib/components/components/PrimaryButton.svelte';
	import SecondaryButton from '$lib/components/components/SecondaryButton.svelte';
	import Card from '$lib/components/components/Card.svelte';
	import TabNavigation from '$lib/components/components/TabNavigation.svelte';
	import { PageLayout, HeroSection, ContentSection } from '$lib/components/layout';
	
	// Tab state for Why Albion section
	let activeWhyTab = 'investors';
	const whyTabs = [
		{ id: 'investors', label: 'For Investors' },
		{ id: 'companies', label: 'For Energy Companies' }
	];
</script>

<svelte:head>
	<title>About - Albion Labs</title>
	<meta name="description" content="Democratizing energy investment to power the future of energy infrastructure" />
</svelte:head>

<PageLayout>
	<!-- Hero Section -->
	<HeroSection 
		title="About Albion Labs"
		subtitle="Democratizing energy investment to power the future of energy infrastructure"
		showBorder={false}
	/>

	<!-- Vision Section -->
	<ContentSection background="gray" padding="standard" centered>
		<SectionTitle level="h2" size="section" center className="mb-8">Our Vision</SectionTitle>
		<div class="max-w-4xl mx-auto">
			<p class="text-lg leading-relaxed text-black mb-6">At Albion Labs, we're making direct investment in energy infrastructure accessible, giving people access to new income streams while helping energy companies unlock new capital to finance the world's energy needs.</p>
			<p class="text-lg leading-relaxed text-black">Our unique background—spanning digital innovation at global tech companies, successful web3 ventures, and the corporate actions for established energy companies—positions us to unlock new models of value creation in the energy sector through transparent, accessible, and efficient blockchain-native solutions.</p>
		</div>
	</ContentSection>

	<!-- Why Albion with Tabs -->
	<ContentSection background="white" padding="standard" centered>
		<div class="max-w-4xl mx-auto">
			<SectionTitle level="h2" size="section" center className="mb-8">Why Albion</SectionTitle>
			
			<!-- Tab Navigation -->
			<div class="mb-8">
				<TabNavigation 
					tabs={whyTabs} 
					bind:activeTab={activeWhyTab} 
					variant="default"
					size="medium"
					centered={true}
				/>
			</div>
			
			<!-- Tab Content -->
			<div class="mt-8">
				{#if activeWhyTab === 'investors'}
					<!-- For Investors Content -->
					<div class="space-y-8">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div class="p-6 bg-light-gray rounded-none">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center font-extrabold">$</div>
									<h4 class="text-lg font-bold text-black">Start Small, Think Big</h4>
								</div>
								<p class="text-sm text-black leading-relaxed">Diversify your portfolio with energy assets starting from just US$1, giving you unparalleled flexibility.</p>
							</div>
							
							<div class="p-6 bg-light-gray rounded-none">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center font-extrabold">⬆</div>
									<h4 class="text-lg font-bold text-black">Institutional-Grade Access</h4>
								</div>
								<p class="text-sm text-black leading-relaxed">Invest in the same quality assets as major funds and institutions, previously reserved for the ultra-wealthy.</p>
							</div>
							
							<div class="p-6 bg-light-gray rounded-none">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center font-extrabold">✓</div>
									<h4 class="text-lg font-bold text-black">Complete Transparency</h4>
								</div>
								<p class="text-sm text-black leading-relaxed">Every payout recorded on-chain. Every transaction verifiable. Full audit trails publicly accessible 24/7.</p>
							</div>
							
							<div class="p-6 bg-light-gray rounded-none">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center font-extrabold">↔</div>
									<h4 class="text-lg font-bold text-black">Liquid When You Need It</h4>
								</div>
								<p class="text-sm text-black leading-relaxed">Trade your tokens on secondary markets anytime. No lock-up periods, no redemption gates.</p>
							</div>
							
							<div class="p-6 bg-light-gray rounded-none md:col-span-2 lg:col-span-1">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center font-extrabold">%</div>
									<h4 class="text-lg font-bold text-black">Real Revenue, Real Returns</h4>
								</div>
								<p class="text-sm text-black leading-relaxed">Earn from actual energy production and sales.</p>
							</div>
						</div>
					</div>
				{:else if activeWhyTab === 'companies'}
					<!-- For Energy Companies Content -->
					<div class="space-y-8">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div class="p-6 bg-light-gray rounded-none">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-10 h-10 bg-secondary text-white rounded-full flex items-center justify-center font-extrabold">🌍</div>
									<h4 class="text-lg font-bold text-black">Global Capital Access</h4>
								</div>
								<p class="text-sm text-black leading-relaxed">Access millions of retail and crypto investors worldwide. Tap new pools of capital for your projects.</p>
							</div>
							
							<div class="p-6 bg-light-gray rounded-none">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-10 h-10 bg-secondary text-white rounded-full flex items-center justify-center font-extrabold">⚡</div>
									<h4 class="text-lg font-bold text-black">Days, Not Months</h4>
								</div>
								<p class="text-sm text-black leading-relaxed">Complete fundraising rounds in days with streamlined digital processes. No roadshows or endless negotiations.</p>
							</div>
							
							<div class="p-6 bg-light-gray rounded-none">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-10 h-10 bg-secondary text-white rounded-full flex items-center justify-center font-extrabold">⚙</div>
									<h4 class="text-lg font-bold text-black">You're in Control</h4>
								</div>
								<p class="text-sm text-black leading-relaxed">Choose exactly which assets to tokenize and what percentage to offer. Maintain full operational control.</p>
							</div>
							
							<div class="p-6 bg-light-gray rounded-none">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-10 h-10 bg-secondary text-white rounded-full flex items-center justify-center font-extrabold">-$</div>
									<h4 class="text-lg font-bold text-black">Cut the Middleman</h4>
								</div>
								<p class="text-sm text-black leading-relaxed">Save 80-90% compared to traditional investment banking fees. More capital for your projects.</p>
							</div>
							
							<div class="p-6 bg-light-gray rounded-none md:col-span-2 lg:col-span-1">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-10 h-10 bg-secondary text-white rounded-full flex items-center justify-center font-extrabold">=</div>
									<h4 class="text-lg font-bold text-black">Keep Your Equity</h4>
								</div>
								<p class="text-sm text-black leading-relaxed">Non-dilutive financing preserves your ownership stake while providing growth capital.</p>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</ContentSection>

	<!-- Founding Heritage Section -->
	<ContentSection background="gray" padding="standard" centered>
		<SectionTitle level="h2" size="section" center className="mb-8">Leadership Team Highlights</SectionTitle>

		<!-- Brand Experience Icons -->
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
			<Card hoverable={false} paddingClass="p-4" roundedClass="rounded-none">
				<div class="text-center">
					<div class="w-full h-20 flex items-center justify-center mx-auto mb-3">
						<img src="/images/google-logo.png" alt="Google" class="h-16 w-auto object-contain" />
					</div>
					<p class="text-xs text-gray-600">Led special projects and high impact initiatives</p>
				</div>
			</Card>
			
			<Card hoverable={false} paddingClass="p-4" roundedClass="rounded-none">
				<div class="text-center">
					<div class="w-full h-20 flex items-center justify-center mx-auto mb-3">
						<img src="/images/virgin-logo.png" alt="Virgin" class="h-16 w-auto object-contain" />
					</div>
					<p class="text-xs text-gray-600">Led special projects and high impact initiatives</p>
				</div>
			</Card>
			
			<Card hoverable={false} paddingClass="p-4" roundedClass="rounded-none">
				<div class="text-center">
					<div class="w-full h-20 flex items-center justify-center mx-auto mb-3">
						<img src="/images/holochain-logo.svg" alt="Holochain" class="h-20 w-auto object-contain" />
					</div>
					<p class="text-xs text-gray-600">Co-Founded</p>
				</div>
			</Card>
			
			<Card hoverable={false} paddingClass="p-2" roundedClass="rounded-none">
				<div class="text-center">
					<div class="w-full h-24 flex items-center justify-center mx-auto mb-2">
						<img src="/images/heritage-oil-logo.svg" alt="Heritage Oil" class="h-24 w-auto object-contain" />
					</div>
					<p class="text-xs text-gray-600">US$1.6Bn Sale to Qatar (2014)</p>
				</div>
			</Card>
		</div>
	</ContentSection>

	<!-- Core Expertise Section -->
	<ContentSection background="white" padding="standard" centered>
		<SectionTitle level="h2" size="section" center className="mb-12">The Albion Advantage</SectionTitle>
		
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
			<Card hoverable={false} paddingClass="p-8" roundedClass="rounded-none">
				<div class="text-center">
					<div class="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center text-2xl font-extrabold mx-auto mb-4">1</div>
					<SectionTitle level="h3" size="small" uppercase>Digital Innovation</SectionTitle>
					<p class="text-sm text-black">Pioneers in digital transformation and blockchain-based smart contract systems.</p>
				</div>
			</Card>
			
			<Card hoverable={false} paddingClass="p-8" roundedClass="rounded-none">
				<div class="text-center">
					<div class="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center text-2xl font-extrabold mx-auto mb-4">2</div>
					<SectionTitle level="h3" size="small" uppercase>Energy Expertise</SectionTitle>
					<p class="text-sm text-black">Deep understanding of energy markets and real-world asset management, rooted in the original "landman" tradition.</p>
				</div>
			</Card>
			
			<Card hoverable={false} paddingClass="p-8" roundedClass="rounded-none">
				<div class="text-center">
					<div class="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center text-2xl font-extrabold mx-auto mb-4">3</div>
					<SectionTitle level="h3" size="small" uppercase>Value Creation</SectionTitle>
					<p class="text-sm text-black">Proven track record in building and exiting successful ventures</p>
				</div>
			</Card>
		</div>
	</ContentSection>

	<!-- Contact CTA -->
	<ContentSection background="white" padding="standard" centered>
			<SectionTitle level="h2" size="section" center className="mb-4">Join us in transforming energy investing</SectionTitle>
			<p class="text-lg text-black mb-8">Be part of the next generation of energy investment infrastructure.</p>
			<div class="flex md:flex-row flex-col gap-4 justify-center items-center">
				<PrimaryButton href="/assets" size="large">Explore Investments</PrimaryButton>
				<SecondaryButton href="mailto:contact@albionlabs.org" size="large">Partner with Us</SecondaryButton>
		</div>
	</ContentSection>
</PageLayout>
