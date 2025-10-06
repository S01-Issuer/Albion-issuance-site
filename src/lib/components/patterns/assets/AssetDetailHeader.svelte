<script lang="ts">
	import type { Asset } from '$lib/types/uiTypes';
	import { getImageUrl } from '$lib/utils/imagePath';
	import { formatCurrency, formatEndDate } from '$lib/utils/formatters';
	import { StatsCard } from '$lib/components/components';
	import { getShareText, getShareUrls, shareViaWebAPI, copyToClipboard, type ShareData } from '$lib/utils/sharing';
	import { onMount } from 'svelte';

	export let asset: Asset;
	export let tokenCount: number = 0;
	export let onTokenSectionClick: (() => void) | undefined = undefined;

	let canUseWebShare = false;

	onMount(() => {
		canUseWebShare = !!navigator.share;
	});

	function getAssetImage(assetData: Asset | null): string {
		return assetData?.coverImage || '/images/placeholder-asset.jpg';
	}

	function getShareData(): ShareData {
		return {
			title: `Investment Opportunity: ${asset?.name}`,
			text: getShareText(asset?.name || 'Asset'),
			url: window.location.href
		};
	}

	function handleShare(platform: keyof ReturnType<typeof getShareUrls>) {
		const shareData = getShareData();
		const urls = getShareUrls(shareData);
		window.open(urls[platform], '_blank');
	}



	async function handleMobileShare() {
		const shareData = getShareData();
		const success = await shareViaWebAPI(shareData);
		
		if (!success) {
			// Fallback to copying link if Web Share API fails
			try {
				// Add UTM parameters for mobile share fallback
				const urlObj = new URL(shareData.url);
				urlObj.searchParams.set('utm_source', 'mobile');
				urlObj.searchParams.set('utm_medium', 'mobile_share');
				urlObj.searchParams.set('utm_campaign', 'asset_sharing');
				urlObj.searchParams.set('utm_content', 'social_share');
				await copyToClipboard(urlObj.toString());
				// You could add a toast notification here
				alert('Link copied to clipboard!');
			} catch (error) {
				console.error('Failed to copy link:', error);
			}
		}
	}

	async function handleCopyLink() {
		try {
			// Add UTM parameters for copy link
			const urlObj = new URL(window.location.href);
			urlObj.searchParams.set('utm_source', 'direct');
			urlObj.searchParams.set('utm_medium', 'copy_link');
			urlObj.searchParams.set('utm_campaign', 'asset_sharing');
			urlObj.searchParams.set('utm_content', 'social_share');
			await copyToClipboard(urlObj.toString());
			// You could add a toast notification here
			alert('Link copied to clipboard!');
		} catch (error) {
			console.error('Failed to copy link:', error);
		}
	}
</script>

<!-- Breadcrumb -->
<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
	<nav class="mb-4 sm:mb-6 lg:mb-8 text-sm font-medium">
		<a href="/assets" class="text-secondary no-underline hover:text-black">← Back to Assets</a>
		<span class="mx-2 text-light-gray">/</span>
		<span class="text-black font-semibold">{asset?.name || 'Asset Details'}</span>
	</nav>
</div>

<!-- Asset Header -->
<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
	<div class="bg-white border border-light-gray section-no-border mb-6 lg:mb-8">
		<div class="py-6 sm:py-8 lg:py-12">
			<div class="mb-6 sm:mb-8 lg:mb-12">
							<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8 mb-6 lg:mb-8">
				<!-- Thumbnail - hidden on mobile -->
				<div class="hidden sm:block w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-lg overflow-hidden border border-light-gray flex-shrink-0">
					<img 
						src={getImageUrl(getAssetImage(asset))} 
						alt={asset?.name || 'Asset'}
						loading="lazy"
						class="w-full h-full object-cover"
					/>
				</div>
					<div class="flex-1">
						<div class="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-start lg:gap-4 mb-4">
							<h1 class="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-extrabold text-black uppercase tracking-tight m-0 leading-tight">{asset?.name}</h1>
							
							<!-- Mobile sharing button -->
							<div class="flex lg:hidden justify-end">
								<button 
									class="flex items-center gap-2 px-4 py-2 bg-white border border-light-gray text-black cursor-pointer transition-all duration-200 rounded hover:bg-light-gray hover:border-secondary hover:text-secondary text-sm font-medium"
									title="Share this investment"
									aria-label="Share this investment"
									on:click={handleMobileShare}
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
										<path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
									</svg>
									Share
								</button>
							</div>

							<!-- Desktop sharing buttons - hidden on mobile -->
							<div class="hidden lg:flex lg:flex-col lg:items-end lg:gap-2 lg:flex-shrink-0">
								<div class="text-xs font-semibold text-black uppercase tracking-wide">Share this investment:</div>
								<div class="flex gap-2">
									<button class="flex items-center justify-center w-8 h-8 bg-white border border-light-gray text-black cursor-pointer transition-all duration-200 rounded hover:bg-light-gray hover:border-secondary hover:text-secondary" title="Share on Twitter" aria-label="Share on Twitter" on:click={() => handleShare('twitter')}>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
											<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
										</svg>
									</button>
									<button class="flex items-center justify-center w-8 h-8 bg-white border border-light-gray text-black cursor-pointer transition-all duration-200 rounded hover:bg-light-gray hover:border-secondary hover:text-secondary" title="Share on LinkedIn" aria-label="Share on LinkedIn" on:click={() => handleShare('linkedin')}>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
											<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
										</svg>
									</button>
									<button class="flex items-center justify-center w-8 h-8 bg-white border border-light-gray text-black cursor-pointer transition-all duration-200 rounded hover:bg-light-gray hover:border-secondary hover:text-secondary" title="Share on Telegram" aria-label="Share on Telegram" on:click={() => handleShare('telegram')}>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
											<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
										</svg>
									</button>
									<button class="flex items-center justify-center w-8 h-8 bg-white border border-light-gray text-black cursor-pointer transition-all duration-200 rounded hover:bg-light-gray hover:border-secondary hover:text-secondary" title="Share on WhatsApp" aria-label="Share on WhatsApp" on:click={() => handleShare('whatsapp')}>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
											<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.893 3.488"/>
										</svg>
									</button>
									<button class="flex items-center justify-center w-8 h-8 bg-white border border-light-gray text-black cursor-pointer transition-all duration-200 rounded hover:bg-light-gray hover:border-secondary hover:text-secondary" title="Share via email" aria-label="Share via email" on:click={() => handleShare('email')}>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
											<path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
										</svg>
									</button>
									<button class="flex items-center justify-center w-8 h-8 bg-white border border-light-gray text-black cursor-pointer transition-all duration-200 rounded hover:bg-light-gray hover:border-secondary hover:text-secondary" title="Copy link" aria-label="Copy link" on:click={handleCopyLink}>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
											<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
											<path d="m14 11-7.54.54-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
										</svg>
									</button>
								</div>
							</div>
						</div>
						<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 mb-2">
							<span class="text-secondary font-medium text-sm">📍 {asset?.location?.state}, {asset?.location?.country}</span>
						</div>
						<div class="text-black opacity-70 text-sm">
							<span>Operated by {asset?.operator?.name}</span>
							<span class="hidden sm:inline">•</span>
							<span class="block sm:inline">License {asset?.technical?.license}</span>
						</div>
					</div>
				</div>
			</div>

					<!-- Mobile: Compact inline stats -->
		<div class="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-8 text-center mb-6 lg:mb-8">
			<StatsCard
				title="Current Production"
				value={(() => {
					const reports = asset?.monthlyReports || [];
					const last = reports.length ? reports[reports.length - 1] : null;
					return last?.production !== undefined && last?.production !== null
						? String(Number(last.production).toFixed(0))
						: '0';
				})()}
				subtitle="BOE/month"
				size="small"
			/>
			<StatsCard
				title="Last Revenue"
				value={(() => {
					const lastReport = asset?.monthlyReports?.[asset.monthlyReports.length - 1];
					return lastReport?.revenue !== undefined && lastReport.revenue > 0
						? formatCurrency(lastReport.revenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
						: 'N/A';
				})()}
				subtitle={(() => {
					const lastReport = asset?.monthlyReports?.[asset.monthlyReports.length - 1];
					return lastReport?.revenue !== undefined && lastReport.revenue > 0 && lastReport.month
						? new Date(lastReport.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
						: '';
				})()}
				size="small"
			/>
			<StatsCard
				title="Available Tokens"
				value={tokenCount.toString()}
				subtitle="Token releases"
				size="small"
				on:click={onTokenSectionClick || (() => {})}
			/>
		</div>
	</div>
</div>
</div>
