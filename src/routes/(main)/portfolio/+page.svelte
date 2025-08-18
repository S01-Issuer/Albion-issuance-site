<script lang="ts">
	import { useClaimsService, useCatalogService } from '$lib/services';
	import type { Asset, Token } from '$lib/types/uiTypes';
	import { web3Modal, signerAddress, connected, loading } from 'svelte-wagmi';
	import { Card, CardContent, CardActions, PrimaryButton, SecondaryButton, StatusBadge, TabNavigation, StatsCard, SectionTitle, ActionCard, TabButton, Chart, BarChart, PieChart, CollapsibleSection, FormattedNumber } from '$lib/components/components';
	import { PageLayout, HeroSection, ContentSection, FullWidthSection } from '$lib/components/layout';
	import { formatCurrency, formatPercentage, formatNumber, formatSmartNumber } from '$lib/utils/formatters';
	import { useTooltip, useCardFlip } from '$lib/composables';
    import { sftMetadata, sfts } from '$lib/stores';
    import { ENERGY_FIELDS, PINATA_GATEWAY } from '$lib/network';
    import { decodeOrder, getLeaf, getMerkleTree, getProofForLeaf, signContext, sortClaimsData, type ClaimHistory } from '$lib/utils/claims';
	import { formatEther, parseEther } from 'viem';
	import { getAllDeposits } from '$lib/queries/getAllDeposits';
	import { decodeSftInformation } from '$lib/decodeMetadata/helpers';

</script>