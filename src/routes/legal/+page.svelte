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
				<a href="/login" class="text-sm text-gray-600 hover:text-gray-900 no-underline">← Back</a>
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
				<div class="legal-content">
					<SectionTitle level="h2" size="section">Terms of Service</SectionTitle>
					<p class="legal-meta">Last updated: December 2024</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">1. Acceptance of Terms</SectionTitle>
					<p>By accessing and using the Albion platform, you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use our services.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">2. Platform Description</SectionTitle>
					<p>Albion provides a blockchain-based platform for investing in tokenized oil &amp; gas assets. Our platform enables users to purchase royalty tokens representing fractional ownership in energy production revenue.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">3. User Eligibility</SectionTitle>
					<p>You must be at least 18 years old and legally capable of entering into binding contracts. You must also comply with all applicable laws and regulations in your jurisdiction.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">4. Account Registration</SectionTitle>
					<p>To use our platform, you must create an account and complete our Know Your Customer (KYC) verification process. You are responsible for maintaining the security of your account credentials.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">5. Investment Terms</SectionTitle>
					<p>All investments are subject to specific terms outlined in the respective token offering documents. Past performance does not guarantee future results. Investments may lose value.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">6. Limitation of Liability</SectionTitle>
					<p>Albion's liability is limited to the maximum extent permitted by law. We are not liable for investment losses, market volatility, or technical issues beyond our control.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">7. Termination</SectionTitle>
					<p>We may terminate or suspend your account at any time for violation of these terms or applicable laws. You may close your account at any time subject to existing investment commitments.</p>
				</div>
			{:else if activeSection === 'privacy'}
				<div class="legal-content">
					<SectionTitle level="h2" size="section">Privacy Policy</SectionTitle>
					<p class="legal-meta">Last updated: December 2024</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">1. Information We Collect</SectionTitle>
					<p>We collect personal information necessary for KYC compliance, including name, address, identification documents, and financial information. We also collect usage data and technical information about your interaction with our platform.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">2. How We Use Information</SectionTitle>
					<p>Your information is used for account verification, compliance with legal requirements, platform operation, customer support, and communication about your investments.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">3. Information Sharing</SectionTitle>
					<p>We may share information with regulatory authorities, service providers, and professional advisors as required by law or necessary for platform operation. We do not sell personal information to third parties.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">4. Data Security</SectionTitle>
					<p>We implement industry-standard security measures including encryption, secure servers, and access controls to protect your personal information.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">5. Data Retention</SectionTitle>
					<p>We retain personal information for as long as necessary to provide services and comply with legal obligations. Some information may be retained longer for regulatory compliance.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">6. Your Rights</SectionTitle>
					<p>You have the right to access, correct, or delete your personal information, subject to legal and contractual requirements. Contact us to exercise these rights.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">7. Cookies and Tracking</SectionTitle>
					<p>We use cookies and similar technologies to improve platform functionality and user experience. You can control cookie settings in your browser.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">8. Contact Information</SectionTitle>
					<p>For privacy-related questions, contact our Data Protection Officer at <a href="mailto:privacy@albion.com">privacy@albion.com</a>.</p>
				</div>
			{:else if activeSection === 'disclosures'}
				<div class="legal-content">
					<SectionTitle level="h2" size="section">Investment Disclosures</SectionTitle>
					<p class="legal-meta">Last updated: December 2024</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">Important Investment Warnings</SectionTitle>
					<div class="legal-callout">
						<p><strong>⚠️ High-Return Investment Warning:</strong> Oil &amp; gas investments carry significant operational, market, and regulatory risks. Returns are not guaranteed and you may lose your entire investment.</p>
					</div>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">1. Nature of Investment</SectionTitle>
					<p>Albion tokens represent fractional ownership in oil &amp; gas revenue streams. Token holders receive payments based on actual production and commodity prices, which can be volatile.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">2. Principal Investment Risks</SectionTitle>
					<ul>
						<li><strong>Commodity Price Risk:</strong> Oil and gas prices fluctuate significantly based on market conditions.</li>
						<li><strong>Production Risk:</strong> Wells may produce less than expected due to geological or operational factors.</li>
						<li><strong>Regulatory Risk:</strong> Changes in regulations may affect operations and profitability.</li>
						<li><strong>Liquidity Risk:</strong> Tokens may not be easily tradeable.</li>
						<li><strong>Technology Risk:</strong> Blockchain and smart contract risks.</li>
					</ul>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">3. No Guarantee of Returns</SectionTitle>
					<p>Projected returns are estimates based on current production and prices. Actual returns may be significantly lower or you may lose your entire investment.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">4. Regulatory Considerations</SectionTitle>
					<p>These investments may be considered securities in some jurisdictions. Ensure compliance with local investment laws before participating.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">5. Tax Implications</SectionTitle>
					<p>Token ownership and distributions may have tax consequences. Consult with a tax professional regarding your specific situation.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">6. Professional Advice</SectionTitle>
					<p>Consider seeking independent financial, legal, and tax advice before making any investment decision.</p>
				</div>
			{:else if activeSection === 'compliance'}
				<div class="legal-content">
					<SectionTitle level="h2" size="section">Regulatory Compliance</SectionTitle>
					<p class="legal-meta">Last updated: December 2024</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">1. Regulatory Framework</SectionTitle>
					<p>Albion operates in compliance with applicable securities, commodities, and financial services regulations. Our legal framework is designed to protect investors while enabling innovation.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">2. Securities Compliance</SectionTitle>
					<p>Token offerings may be subject to securities regulations. We work with legal counsel to ensure appropriate compliance structures including proper registration or exemptions.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">3. Anti-Money Laundering (AML)</SectionTitle>
					<p>We maintain comprehensive AML policies including customer due diligence, ongoing monitoring, and suspicious activity reporting as required by law.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">4. Know Your Customer (KYC)</SectionTitle>
					<p>All users must complete identity verification including:</p>
					<ul>
						<li>Government-issued photo identification</li>
						<li>Proof of address</li>
						<li>Source of funds verification</li>
						<li>Sanctions and PEP screening</li>
					</ul>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">5. Data Protection</SectionTitle>
					<p>We comply with applicable data protection laws including GDPR, CCPA, and other privacy regulations where applicable.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">6. Jurisdictional Restrictions</SectionTitle>
					<p>Our services may not be available in all jurisdictions. We maintain restrictions on certain countries and regions as required by law.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">7. Audit and Reporting</SectionTitle>
					<p>We engage independent auditors and maintain regular reporting to regulatory authorities as required. All asset valuations and performance data are verified by third parties.</p>

					<SectionTitle level="h3" size="subsection" className="legal-subheading">8. Investor Protection</SectionTitle>
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

<style>
	.legal-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.legal-content :global(p) {
		margin: 0;
		color: #111827;
		font-size: 1rem;
		line-height: 1.75rem;
	}

	.legal-content :global(a) {
		color: #0d9488;
		text-decoration: none;
	}

	.legal-content :global(a:hover) {
		text-decoration: underline;
	}

	.legal-content :global(ul) {
		margin: 0;
		padding-left: 1.25rem;
		list-style-type: disc;
		color: #111827;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.legal-content :global(li) {
		margin: 0;
		line-height: 1.7rem;
	}

	.legal-meta {
		margin: 0;
		color: rgba(17, 24, 39, 0.7);
		font-size: 0.875rem;
	}

	.legal-subheading {
		margin-top: 0.5rem;
	}

	.legal-callout {
		background-color: #fef3c7;
		border: 1px solid #facc15;
		border-radius: 0.75rem;
		padding: 1.5rem;
	}

	.legal-callout p {
		margin: 0;
		color: #92400e;
		font-weight: 600;
	}
</style>
