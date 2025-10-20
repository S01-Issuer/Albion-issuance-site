export interface PinnedMetadataPayoutEntry {
  month?: string;
  tokenPayout?: {
    totalPayout?: number;
    payoutPerToken?: number;
    txHash?: string;
    orderHash?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PinnedMetadataPlannedProjection {
  month?: string;
  production?: number;
  [key: string]: unknown;
}

export interface PinnedMetadataPlannedProduction {
  oilPriceAssumption?: number;
  oilPriceAssumptionCurrency?: string;
  projections?: PinnedMetadataPlannedProjection[];
  [key: string]: unknown;
}

export interface PinnedMetadataReceiptsRecord {
  month?: string;
  assetData?: {
    production?: number;
    revenue?: number;
    expenses?: number;
    netIncome?: number;
    [key: string]: unknown;
  };
  realisedPrice?: {
    oilPrice?: number;
    gasPrice?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PinnedMetadataGalleryImage {
  title?: string;
  url?: string;
  caption?: string;
  [key: string]: unknown;
}

export interface PinnedMetadataAsset {
  assetName?: string;
  description?: string;
  cashflowProvider?: string;
  cashflowStartDate?: string;
  coverImage?: string;
  galleryImages?: PinnedMetadataGalleryImage[];
  location?: {
    state?: string;
    county?: string;
    country?: string;
    coordinates?: {
      lat?: number;
      lng?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  operator?: {
    name?: string;
    website?: string;
    experience?: string | number;
    [key: string]: unknown;
  };
  technical?: {
    fieldType?: string;
    depth?: string;
    license?: string;
    estimatedLife?: string;
    firstOil?: string;
    infrastructure?: string;
    environmental?: string;
    expectedEndDate?: string;
    crudeBenchmark?: string;
    pricing?: {
      benchmarkPremium?: number;
      transportCosts?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  production?: {
    status?: string;
    current?: string;
    [key: string]: unknown;
  };
  assetTerms?: {
    interestType?: string;
    amount?: number;
    paymentFrequencyDays?: number;
    sharePercentage?: number;
    [key: string]: unknown;
  };
  plannedProduction?: PinnedMetadataPlannedProduction;
  historicalProduction?: Array<{
    month?: string;
    production?: number;
    [key: string]: unknown;
  }>;
  operationalMetrics?: Record<string, unknown> | undefined;
  receiptsData?: PinnedMetadataReceiptsRecord[];
  [key: string]: unknown;
}

export interface PinnedMetadata {
  contractAddress?: string;
  symbol?: string;
  releaseName?: string;
  tokenType?: string;
  firstPaymentDate?: string;
  sharePercentage?: number;
  payoutData?: PinnedMetadataPayoutEntry[];
  asset?: PinnedMetadataAsset;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
