<script lang="ts">
	import '../app.css';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { env as publicEnv } from '$env/dynamic/public';
	import { defaultConfig } from 'svelte-wagmi';
	import { base } from '@wagmi/core/chains';
	import { injected, walletConnect } from '@wagmi/connectors';
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
		const erckit = defaultConfig({
			autoConnect: true,
			appName: 'base',
			walletConnectProjectId: PUBLIC_WALLETCONNECT_ID,
			chains: [baseNetworkFallbackRpcs], // Use custom chain with multiple RPC URLs
			connectors: [injected(), walletConnect({ projectId: PUBLIC_WALLETCONNECT_ID })]
		});
		await erckit.init();
	};

	onMount(() => {
		initWallet();
		injectAnalytics();
		injectSpeedInsights();
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<QueryClientProvider client={queryClient}>
	<slot />
</QueryClientProvider>