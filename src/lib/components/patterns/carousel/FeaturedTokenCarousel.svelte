	import { useCatalogService } from '$lib/services';
	import type { Token, Asset } from '$lib/types/uiTypes';
	import { PrimaryButton, SecondaryButton, FormattedNumber, FormattedReturn } from '$lib/components/components';
	import { sftMetadata, sfts } from '$lib/stores';
	import { formatCurrency, formatTokenSupply, formatSmartReturn, formatSmartNumber } from '$lib/utils/formatters';
	import { meetsSupplyThreshold, formatSupplyAmount, getAvailableSupplyBigInt } from '$lib/utils/tokenSupplyUtils';
	import type { TokenMetadata } from '$lib/types/MetaboardTypes';
	import { getEnergyFieldId } from '$lib/utils/energyFieldGrouping';