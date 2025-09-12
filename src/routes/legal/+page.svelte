<script lang="ts">
	import SectionTitle from '$lib/components/components/SectionTitle.svelte';
	import TabButton from '$lib/components/components/TabButton.svelte';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	
	let activeSection = 'terms';

	onMount(() => {
		const tab = $page.url.searchParams.get('tab');
		if (tab === 'privacy' || tab === 'terms' || tab === 'disclosures' || tab === 'compliance') {
			activeSection = tab;
		}
	});
</script>

<svelte:head>
	<title>Legal - Albion</title>
	<meta name="description" content="Legal information, terms of service, and compliance details for Albion platform" />
</svelte:head>

<div class="min-h-screen bg-white">
	<!-- Simple Header -->
	<div class="border-b border-gray-200 bg-white">
		<div class="max-w-6xl mx-auto px-4 py-6">
			<div class="flex items-center justify-between">
				<img src="/assets/logo.svg" alt="Albion Labs Logo" class="h-12 w-auto" />
				<a href="/login" class="text-sm text-gray-600 hover:text-gray-900 underline">← Back to Login</a>
			</div>
		</div>
	</div>

	<!-- Hero Section -->
	<div class="max-w-6xl mx-auto px-4 py-12">
		<div class="text-center mb-12">
			<h1 class="text-4xl font-extrabold text-black mb-4">Legal Information</h1>
			<p class="text-lg text-gray-600">Important legal documents and compliance information for the Albion platform.</p>
		</div>

		<!-- Legal Tabs -->
		<div class="bg-white border border-gray-300 mb-8">
			<div class="flex flex-wrap border-b border-gray-300">
				<TabButton 
					active={activeSection === 'terms'}
					on:click={() => activeSection = 'terms'}
				>
					Terms of Service
				</TabButton>
				<TabButton 
					active={activeSection === 'privacy'}
					on:click={() => activeSection = 'privacy'}
				>
					Privacy Policy
				</TabButton>
				<TabButton 
					active={activeSection === 'disclosures'}
					on:click={() => activeSection = 'disclosures'}
				>
					Investment Disclosures
				</TabButton>
				<TabButton 
					active={activeSection === 'compliance'}
					on:click={() => activeSection = 'compliance'}
				>
					Compliance
				</TabButton>
			</div>

			<!-- Tab Content -->
			<div class="p-8">
			{#if activeSection === 'terms'}
				<SectionTitle level="h2" size="section">Terms of Service</SectionTitle>
				<p class="text-black opacity-70 text-sm mb-8">Last updated: December 2024</p>
				
				<div class="space-y-4">
					<SectionTitle level="h3" size="subsection" className="mt-8 mb-4">1. Acceptance of Terms</SectionTitle>
					<p class="leading-relaxed mb-4 text-black">By accessing and using the Albion platform, you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use our services.</p>
					
					<SectionTitle level="h3" size="subsection" className="mt-8 mb-4">2. Platform Description</SectionTitle>
					<p class="leading-relaxed mb-4 text-black">Albion provides a blockchain-based platform for investing in tokenized oil & gas assets. Our platform enables users to purchase royalty tokens representing fractional ownership in energy production revenue.</p>
					
					<SectionTitle level="h3" size="subsection" className="mt-8 mb-4">3. User Eligibility</SectionTitle>
					<p class="leading-relaxed mb-4 text-black">You must be at least 18 years old and legally capable of entering into binding contracts. You must also comply with all applicable laws and regulations in your jurisdiction.</p>
					
					<SectionTitle level="h3" size="subsection" className="mt-8 mb-4">4. Account Registration</SectionTitle>
					<p class="leading-relaxed mb-4 text-black">To use our platform, you must create an account and complete our Know Your Customer (KYC) verification process. You are responsible for maintaining the security of your account credentials.</p>
					
					<SectionTitle level="h3" size="subsection" className="mt-8 mb-4">5. Investment Terms</SectionTitle>
					<p class="leading-relaxed mb-4 text-black">All investments are subject to specific terms outlined in the respective token offering documents. Past performance does not guarantee future results. Investments may lose value.</p>
					
					<SectionTitle level="h3" size="subsection" className="mt-8 mb-4">6. Limitation of Liability</SectionTitle>
					<p class="leading-relaxed mb-4 text-black">Albion's liability is limited to the maximum extent permitted by law. We are not liable for investment losses, market volatility, or technical issues beyond our control.</p>
					
					<SectionTitle level="h3" size="subsection" className="mt-8 mb-4">7. Termination</SectionTitle>
					<p class="leading-relaxed mb-4 text-black">We may terminate or suspend your account at any time for violation of these terms or applicable laws. You may close your account at any time subject to existing investment commitments.</p>
				</div>
			{:else if activeSection === 'privacy'}
				<SectionTitle level="h2" size="section">Privacy Policy</SectionTitle>
				<p class="text-black opacity-70 text-sm mb-8">Last updated: December 2024</p>
				
				<div class="space-y-4">
					<h3>1. Information We Collect</h3>
					<p>We collect personal information necessary for KYC compliance, including name, address, identification documents, and financial information. We also collect usage data and technical information about your interaction with our platform.</p>
					
					<h3>2. How We Use Information</h3>
					<p>Your information is used for account verification, compliance with legal requirements, platform operation, customer support, and communication about your investments.</p>
					
					<h3>3. Information Sharing</h3>
					<p>We may share information with regulatory authorities, service providers, and professional advisors as required by law or necessary for platform operation. We do not sell personal information to third parties.</p>
					
					<h3>4. Data Security</h3>
					<p>We implement industry-standard security measures including encryption, secure servers, and access controls to protect your personal information.</p>
					
					<h3>5. Data Retention</h3>
					<p>We retain personal information for as long as necessary to provide services and comply with legal obligations. Some information may be retained longer for regulatory compliance.</p>
					
					<h3>6. Your Rights</h3>
					<p>You have the right to access, correct, or delete your personal information, subject to legal and contractual requirements. Contact us to exercise these rights.</p>
					
					<h3>7. Cookies and Tracking</h3>
					<p>We use cookies and similar technologies to improve platform functionality and user experience. You can control cookie settings in your browser.</p>
					
					<h3>8. Contact Information</h3>
					<p>For privacy-related questions, contact our Data Protection Officer at privacy@albion.com.</p>
				</div>
			{:else if activeSection === 'disclosures'}
				<SectionTitle level="h2" size="section">Investment Disclosures</SectionTitle>
				<p class="text-black opacity-70 text-sm mb-8">Last updated: December 2024</p>
				
				<div class="space-y-4">
					<h3>Important Investment Warnings</h3>
					<div class="bg-yellow-50 border border-yellow-400 p-6 my-8">
						<h4 class="text-yellow-800 font-extrabold mb-3 text-base">⚠️ High-Return Investment Warning</h4>
						<p class="text-yellow-800 mb-0 font-semibold">Oil & gas investments carry significant operational, market, and regulatory risks. Returns are not guaranteed and you may lose your entire investment.</p>
					</div>
					
					<h3>1. Nature of Investment</h3>
					<p>Albion tokens represent fractional ownership in oil & gas revenue streams. Token holders receive payments based on actual production and commodity prices, which can be volatile.</p>
					
					<h3>2. Principal Investment Risks</h3>
					<ul>
						<li><strong>Commodity Price Risk:</strong> Oil and gas prices fluctuate significantly based on market conditions</li>
						<li><strong>Production Risk:</strong> Wells may produce less than expected due to geological or operational factors</li>
						<li><strong>Regulatory Risk:</strong> Changes in regulations may affect operations and profitability</li>
						<li><strong>Liquidity Risk:</strong> Tokens may not be easily tradeable</li>
						<li><strong>Technology Risk:</strong> Blockchain and smart contract risks</li>
					</ul>
					
					<h3>3. No Guarantee of Returns</h3>
					<p>Projected returns are estimates based on current production and prices. Actual returns may be significantly lower or you may lose your entire investment.</p>
					
					<h3>4. Regulatory Considerations</h3>
					<p>These investments may be considered securities in some jurisdictions. Ensure compliance with local investment laws before participating.</p>
					
					<h3>5. Tax Implications</h3>
					<p>Token ownership and distributions may have tax consequences. Consult with a tax professional regarding your specific situation.</p>
					
					<h3>6. Professional Advice</h3>
					<p>Consider seeking independent financial, legal, and tax advice before making any investment decision.</p>
				</div>
			{:else if activeSection === 'compliance'}
				<SectionTitle level="h2" size="section">Regulatory Compliance</SectionTitle>
				<p class="text-black opacity-70 text-sm mb-8">Last updated: December 2024</p>
				
				<div class="space-y-4">
					<h3>1. Regulatory Framework</h3>
					<p>Albion operates in compliance with applicable securities, commodities, and financial services regulations. Our legal framework is designed to protect investors while enabling innovation.</p>
					
					<h3>2. Securities Compliance</h3>
					<p>Token offerings may be subject to securities regulations. We work with legal counsel to ensure appropriate compliance structures including proper registration or exemptions.</p>
					
					<h3>3. Anti-Money Laundering (AML)</h3>
					<p>We maintain comprehensive AML policies including customer due diligence, ongoing monitoring, and suspicious activity reporting as required by law.</p>
					
					<h3>4. Know Your Customer (KYC)</h3>
					<p>All users must complete identity verification including:</p>
					<ul>
						<li>Government-issued photo identification</li>
						<li>Proof of address</li>
						<li>Source of funds verification</li>
						<li>Sanctions and PEP screening</li>
					</ul>
					
					<h3>5. Data Protection</h3>
					<p>We comply with applicable data protection laws including GDPR, CCPA, and other privacy regulations where applicable.</p>
					
					<h3>6. Jurisdictional Restrictions</h3>
					<p>Our services may not be available in all jurisdictions. We maintain restrictions on certain countries and regions as required by law.</p>
					
					<h3>7. Audit and Reporting</h3>
					<p>We engage independent auditors and maintain regular reporting to regulatory authorities as required. All asset valuations and performance data are verified by third parties.</p>
					
					<h3>8. Investor Protection</h3>
					<p>We maintain appropriate investor protection measures including segregated client funds, professional indemnity insurance, and independent custody arrangements where applicable.</p>
				</div>
			{/if}
			</div>
		</div>

		<!-- Contact Section -->
		<div class="bg-gray-900 text-white py-16 -mx-4">
			<div class="max-w-4xl mx-auto px-4 text-center">
				<h2 class="text-3xl font-extrabold mb-4">Legal Questions?</h2>
				<p class="text-lg mb-6 opacity-90">If you have questions about our legal documents or compliance procedures, contact our legal team at <a href="mailto:legal@albionlabs.org" class="text-white underline hover:no-underline">legal@albionlabs.org</a></p>
			</div>
		</div>
	</div>
</div>

