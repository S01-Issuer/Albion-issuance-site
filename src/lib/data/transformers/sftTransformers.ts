/**
 * SFT Data Transformers
 * Handles all transformations between raw data and UI types
 */

import type { OffchainAssetReceiptVault } from "$lib/types/graphql";
import type { Asset, Token, PlannedProduction } from "$lib/types/uiTypes";
import { mergeProductionHistory } from "$lib/utils/productionMerge";
import type { TokenMetadata, PayoutData } from "$lib/types/MetaboardTypes";
import type { ISODateTimeString } from "$lib/types/sharedTypes";
import { PINATA_GATEWAY } from "$lib/network";

/**
 * Base transformer for common SFT data
 */
class BaseSftTransformer {
  /**
   * Convert timestamp to ISO date string
   */
  protected timestampToISO(timestamp: string | number): ISODateTimeString {
    const ts = Number(timestamp);
    if (isNaN(ts) || ts <= 0) {
      return new Date().toISOString() as ISODateTimeString;
    }
    return new Date(ts * 1000).toISOString() as ISODateTimeString;
  }

  /**
   * Create metadata timestamps from SFT deploy timestamp
   */
  protected createMetadataTimestamps(sft: OffchainAssetReceiptVault) {
    const isoDate = this.timestampToISO(sft.deployTimestamp);
    return {
      createdAt: isoDate,
      updatedAt: isoDate,
    };
  }

  /**
   * Validate required metadata fields
   */
  protected validateMetadata(metadata: any, requiredFields: string[]): void {
    if (!metadata) {
      throw new Error("Missing metadata");
    }

    for (const field of requiredFields) {
      const value = this.getNestedValue(metadata, field);
      if (value === undefined || value === null) {
        throw new Error(`Missing or invalid ${field}`);
      }
    }
  }

  /**
   * Get nested object value using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^-\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return 0;
}

/**
 * Transform SFT data to Token type
 */
export class TokenTransformer extends BaseSftTransformer {
  transform(
    sft: OffchainAssetReceiptVault,
    pinnedMetadata: any,
    maxSupply: string,
  ): Token {
    const token: Token = {
      contractAddress: sft.id,
      name: sft.name,
      symbol: sft.symbol,
      decimals: 18, // All SFTs have default 18 decimals
      tokenType: "royalty",
      isActive: true,
      supply: {
        maxSupply: maxSupply.toString(),
        mintedSupply: sft.totalShares.toString(),
      },
      holders: sft.tokenHolders.map((holder) => ({
        address: holder.address,
        balance: holder.balance,
      })),
      payoutHistory: [],
      sharePercentage: pinnedMetadata?.sharePercentage || 0,
      firstPaymentDate: undefined,
      metadata: this.createMetadataTimestamps(sft),
    };

    return token;
  }
}

/**
 * Transform SFT data to TokenMetadata type
 */
export class TokenMetadataTransformer extends BaseSftTransformer {
  private readonly REQUIRED_FIELDS = [
    "releaseName",
    "tokenType",
    "sharePercentage",
    "firstPaymentDate",
    "asset",
  ];

  transform(
    sft: OffchainAssetReceiptVault,
    pinnedMetadata: any,
    maxSupply: string,
  ): TokenMetadata {
    // Validate required fields
    this.validateMetadata(pinnedMetadata, this.REQUIRED_FIELDS);

    // Additional validation
    if (
      typeof pinnedMetadata.sharePercentage !== "number" ||
      pinnedMetadata.sharePercentage < 0 ||
      pinnedMetadata.sharePercentage > 100
    ) {
      throw new Error("Invalid sharePercentage - must be between 0 and 100");
    }

    const payoutData = this.extractPayoutData(pinnedMetadata, sft.id);

    const tokenMetadata: TokenMetadata = {
      contractAddress: sft.id,
      symbol: sft.symbol,
      releaseName: pinnedMetadata.releaseName,
      tokenType: pinnedMetadata.tokenType,
      firstPaymentDate: pinnedMetadata.firstPaymentDate,
      sharePercentage: pinnedMetadata.sharePercentage,
      payoutData,
      asset: {
        ...(pinnedMetadata.asset || {}),
        status: pinnedMetadata.asset?.production?.status || "producing",
      },
      metadata: pinnedMetadata.metadata || this.createMetadataTimestamps(sft),
    };

    return tokenMetadata;
  }

  private extractPayoutData(metadata: any, contractAddress: string): PayoutData[] {
    const candidates = [
      metadata?.payoutData,
      metadata?.token?.payoutData,
      metadata?.token?.distributions,
      metadata?.distributions,
      metadata?.payouts,
      metadata?.asset?.payoutData,
      metadata?.asset?.distributions,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        const normalized = candidate
          .map((entry: any) => this.normalizePayoutEntry(entry))
          .filter((entry): entry is PayoutData => entry !== null);
        if (normalized.length > 0) {
          console.log('[TokenMetadataTransformer] Payout data detected', {
            contractAddress,
            count: normalized.length,
            months: normalized.map((entry) => entry.month),
          });
          return normalized;
        }
      }
    }

    return [];
  }

  private normalizePayoutEntry(entry: any): PayoutData | null {
    if (!entry) {
      return null;
    }

    const rawMonth = entry.month || entry.period || entry.date;
    if (!rawMonth) {
      return null;
    }
    const month = typeof rawMonth === "string" ? rawMonth : String(rawMonth);
    const monthValue = month.trim();
    if (!monthValue) {
      return null;
    }

    const payout = entry.tokenPayout || entry.distribution || entry.payout || entry;

    const totalPayout = toNumber(
      payout?.totalPayout ?? payout?.total ?? payout?.amount ?? entry.totalPayout,
    );
    const payoutPerToken = toNumber(
      payout?.payoutPerToken ?? payout?.perToken ?? entry.payoutPerToken,
    );
    const txHash = payout?.txHash || entry.txHash || entry.transactionHash || "";
    const orderHash =
      payout?.orderHash ||
      payout?.order?.orderHash ||
      entry.orderHash ||
      entry.order?.orderHash ||
      "";

    return {
      month: monthValue,
      tokenPayout: {
        totalPayout,
        payoutPerToken,
        txHash,
        orderHash,
      },
    };
  }
}

/**
 * Transform SFT data to Asset type
 */
export class AssetTransformer extends BaseSftTransformer {
  private readonly REQUIRED_FIELDS = [
    "asset.assetName",
    "asset.location",
    "asset.operator",
    "asset.technical",
    "asset.assetTerms",
  ];

  transform(sft: OffchainAssetReceiptVault, pinnedMetadata: any): Asset {
    // Validate required fields
    this.validateMetadata(pinnedMetadata, this.REQUIRED_FIELDS);

    const assetData = pinnedMetadata.asset;
    // Build merged monthly reports first so we can derive current production
    const monthlyReports = this.transformMonthlyReports(
      assetData,
      pinnedMetadata,
    );

    const asset: Asset = {
      id: sft.id,
      name: assetData.assetName,
      description: assetData.description || "",
      coverImage: this.formatImageUrl(assetData.coverImage),
      images: this.formatGalleryImages(assetData.galleryImages),
      galleryImages: this.formatGalleryImages(assetData.galleryImages),
      location: this.transformLocation(assetData.location),
      operator: this.transformOperator(assetData.operator),
      technical: this.transformTechnical(assetData.technical),
      status: assetData.production?.status || "producing",
      terms: this.transformTerms(assetData.assetTerms),
      assetTerms: this.transformTerms(assetData.assetTerms),
      tokenContracts: [sft.id],
      monthlyReports,
      plannedProduction: this.transformPlannedProduction(
        assetData.plannedProduction,
      ),
      operationalMetrics: this.transformOperationalMetrics(
        assetData.operationalMetrics,
      ),
      metadata: this.createMetadataTimestamps(sft),
    };

    return asset;
  }

  private formatImageUrl(imageHash?: string): string {
    return imageHash ? `${PINATA_GATEWAY}/${imageHash}` : "";
  }

  private formatGalleryImages(
    images?: any[],
  ): Array<{ title: string; url: string; caption: string }> {
    if (!Array.isArray(images)) return [];

    return images.map((image: any) => ({
      title: image?.title || "",
      url: image?.url ? `${PINATA_GATEWAY}/${image.url}` : "",
      caption: image?.caption || "",
    }));
  }

  private transformLocation(location: any) {
    return {
      state: location.state,
      county: location.county,
      country: location.country,
      coordinates: {
        lat: location.coordinates?.lat || 0,
        lng: location.coordinates?.lng || 0,
      },
      waterDepth: null,
    };
  }

  private transformOperator(operator: any) {
    return {
      name: operator.name,
      website: operator.website || "",
      experience: operator.experience || "",
    };
  }

  private transformTechnical(technical: any) {
    return {
      fieldType: technical.fieldType,
      depth: technical.depth,
      license: technical.license,
      estimatedLife: technical.estimatedLife,
      firstOil: technical.firstOil,
      infrastructure: technical.infrastructure,
      environmental: technical.environmental,
      expectedEndDate: technical.expectedEndDate,
      crudeBenchmark: technical.crudeBenchmark,
      pricing: {
        benchmarkPremium: (technical.pricing?.benchmarkPremium || 0).toString(),
        transportCosts: (technical.pricing?.transportCosts || 0).toString(),
      },
    };
  }

  private transformProduction(assetData: any, mergedMonthlyReports: any[]) {
    // Derive current production from latest merged monthly report when available
    const latest = mergedMonthlyReports?.length
      ? mergedMonthlyReports[mergedMonthlyReports.length - 1]
      : undefined;
    const latestProduction = latest?.production;
    const currentProduction =
      latestProduction !== undefined && latestProduction !== null
        ? `${Number(latestProduction).toFixed(0)} BOE/month`
        : assetData.production?.current;

    return {
      current: currentProduction,
      status: assetData.production?.status,
    };
  }

  private transformTerms(assetTerms: any) {
    return {
      interestType: assetTerms.interestType,
      amount: assetTerms.amount,
      paymentFrequency: assetTerms.paymentFrequencyDays,
    };
  }

  private transformMonthlyReports(assetData: any, pinnedMetadata: any) {
    return mergeProductionHistory(
      assetData.historicalProduction,
      assetData.receiptsData,
      pinnedMetadata?.payoutData,
    );
  }

  private transformPlannedProduction(
    plannedProduction: any,
  ): PlannedProduction {
    return {
      oilPriceAssumption: plannedProduction?.oilPriceAssumption || 0,
      oilPriceAssumptionCurrency:
        plannedProduction?.oilPriceAssumptionCurrency || "USD",
      projections: plannedProduction?.projections || [],
    };
  }

  private transformOperationalMetrics(metrics: any) {
    return (
      metrics || {
        uptime: { percentage: 0, unit: "%", period: "unknown" },
        hseMetrics: {
          incidentFreeDays: 0,
          lastIncidentDate: new Date().toISOString(),
          safetyRating: "Unknown",
        },
      }
    );
  }
}

// Export singleton instances
export const tokenTransformer = new TokenTransformer();
export const tokenMetadataTransformer = new TokenMetadataTransformer();
export const assetTransformer = new AssetTransformer();
