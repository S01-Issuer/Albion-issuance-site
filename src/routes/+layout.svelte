<script lang="ts">
	import '../app.css';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { env as publicEnv } from '$env/dynamic/public';
	import { defaultConfig } from 'svelte-wagmi';
	import { base } from '@wagmi/core/chains';
	import { injected, walletConnect } from '@wagmi/connectors';
	import { fallback, http, type Transport } from 'viem';
	import { onMount } from 'svelte';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';

	// Prefer dedicated / third-party RPCs; mainnet.base.org is last (strict 429 limits).
	const rpcList = [
		publicEnv.PUBLIC_BASE_RPC_URL,
		"https://base-rpc.publicnode.com",
		"https://base.llamarpc.com",
		"https://base.meowrpc.com",
		"https://base-mainnet.public.blastapi.io",
		"https://gateway.tenderly.co/public/base",
		"https://mainnet.base.org"
	].filter((url): url is string => typeof url === "string" && url.length > 0);

	const baseNetworkFallbackRpcs = {
		...base,
		rpcUrls: {
			...base.rpcUrls,
			default: { http: rpcList },
			public: { http: rpcList }
		}
	};


	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: Infinity
			}
		}
	});

	const initWallet = async () => {
		const PUBLIC_WALLETCONNECT_ID = publicEnv.PUBLIC_WALLETCONNECT_ID || '';
		
		// Create a fallback transport that automatically rotates through multiple RPCs
		// This provides resilience: if one RPC fails, viem automatically tries the next
		const rpcUrls = baseNetworkFallbackRpcs.rpcUrls.default.http;
		
		// No per-transport retries — let the outer fallback rotate to the next RPC
		// immediately on failure (e.g. 429) instead of hammering the same endpoint.
		const transports = rpcUrls.map((url, index) =>
			http(url, {
				name: `RPC-${index + 1}`,
				retryCount: 0,
				timeout: 15_000,
			})
		);

		// Fallback transport with aggressive rotation for resilience
		const transport = fallback(
			transports,
			{
				rank: {
					interval: 60_000, // Re-rank RPCs every 60 seconds
					sampleCount: 5,
					timeout: 2_000,
					weights: {
						latency: 0.2,
						stability: 0.8  // Prioritize stability over latency
					}
				},
				retryCount: 5  // Try up to 5 different RPCs before failing
			}
		);
		
		const erckit = defaultConfig({
			autoConnect: true,
			appName: 'base',
			walletConnectProjectId: PUBLIC_WALLETCONNECT_ID,
			chains: [baseNetworkFallbackRpcs],
			connectors: [injected(), walletConnect({ projectId: PUBLIC_WALLETCONNECT_ID })],
			transports: {
				[base.id]: transport
			}
		} as Parameters<typeof defaultConfig>[0] & {
			transports: Record<number, Transport>;
		});
		await erckit.init();
	};

	onMount(() => {
		initWallet();
		injectAnalytics();
		injectSpeedInsights();

		// MailerLite forms should now work with direct form submission

		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<svelte:head>
    <!-- MailerLite Form Scripts -->
    <script src="https://groot.mailerlite.com/js/w/webforms.min.js?v176e10baa5e7ed80d35ae235be3d5024"></script>
</svelte:head>

<QueryClientProvider client={queryClient}>
	<slot />
</QueryClientProvider>
