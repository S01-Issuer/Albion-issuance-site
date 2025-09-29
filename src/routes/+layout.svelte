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

	const baseNetworkFallbackRpcs = {
		...base,
		rpcUrls: {
			...base.rpcUrls,
			default: {
				http: [
					"https://mainnet.base.org",                    // Official Base RPC
					"https://base-rpc.publicnode.com",             // PublicNode
					"https://base.llamarpc.com",                   // LlamaRPC
					"https://0xrpc.io/base",                       // 0xRPC
					"https://base.drpc.org",                       // DRPC
					"https://base-mainnet.gateway.tatum.io",       // Tatum
					"https://base.blockpi.network/v1/rpc/public",  // BlockPI
					"https://1rpc.io/base",                        // 1RPC
					"https://base.meowrpc.com"                     // MeowRPC
				]
			},
			public: {
				http: [
					"https://mainnet.base.org",                    // Official Base RPC
					"https://base-rpc.publicnode.com",             // PublicNode
					"https://base.llamarpc.com",                   // LlamaRPC
					"https://0xrpc.io/base",                       // 0xRPC
					"https://base.drpc.org",                       // DRPC
					"https://base-mainnet.gateway.tatum.io",       // Tatum
					"https://base.blockpi.network/v1/rpc/public",  // BlockPI
					"https://1rpc.io/base",                        // 1RPC
					"https://base.meowrpc.com"                     // MeowRPC
				]
			}
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
		
		// Add logging in development to verify RPC rotation
		const transports = rpcUrls.map((url, index) => {
			const httpTransport = http(url, {
				name: `RPC-${index + 1}`,
				retryCount: 2,
				retryDelay: 150,
				timeout: 10_000,
			});
			return httpTransport;
		});

		const transport = fallback(
			transports,
			{
				rank: {
					interval: 30_000, // Re-rank RPCs every 30 seconds
					sampleCount: 5,    // Use last 5 samples for ranking
					timeout: 1_000,    // 1 second timeout for ranking requests
					weights: {
						latency: 0.3,
						stability: 0.7
					}
				},
				retryCount: 3
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
