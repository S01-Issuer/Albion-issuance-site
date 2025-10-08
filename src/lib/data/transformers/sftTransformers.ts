/**
 * SFT Data Transformers
 * Handles all transformations between raw data and UI types
 */

import type { OffchainAssetReceiptVault } from "$lib/types/graphql";
import type { Asset, Token, PlannedProduction } from "$lib/types/uiTypes";
import { mergeProductionHistory } from "$lib/utils/productionMerge";
import {
  TokenType,
  ProductionStatus,
  DocumentType,
  type TokenMetadata,
  type PayoutData,
  type AssetData,
  type PlannedProduction as MetadataPlannedProduction,
  type ReceiptsData,
  type HistoricalProductionRecord as MetadataHistoricalRecord,
  type Document as MetadataDocument,
} from "$lib/types/MetaboardTypes";
import type { ISODateTimeString } from "$lib/types/sharedTypes";
import { PINATA_GATEWAY } from "$lib/network";
import type {
  PinnedMetadata,
  PinnedMetadataAsset,
  PinnedMetadataGalleryImage,
  PinnedMetadataPayoutEntry,
  PinnedMetadataReceiptsRecord,
} from "$lib/types/PinnedMetadata";
import type { Metadata } from "$lib/types/sharedTypes";
import type {
  HistoricalRecord as MergeHistoricalRecord,
  ReceiptsRecord as MergeReceiptsRecord,
  PayoutRecord as MergePayoutRecord,
} from "$lib/utils/productionMerge";

const TOKEN_TYPE_VALUES = new Set(Object.values(TokenType));
const PRODUCTION_STATUS_VALUES = new Set(Object.values(ProductionStatus));
const ASSET_STATUS_VALUES: Asset["status"][] = [
  "funding",
  "producing",
  "completed",
];

function ensureYearMonth(
  value: unknown,
  fallback: `${number}-${number}` = "1970-01",
): `${number}-${number}` {
  if (typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return value as `${number}-${number}`;
  }
  return fallback;
}

function ensureTokenType(value: unknown): TokenType {
  if (typeof value === "string") {
    const normalized = value.toLowerCase() as TokenType;
    if (TOKEN_TYPE_VALUES.has(normalized)) {
      return normalized;
    }
  }
  throw new Error(`Invalid tokenType value: ${String(value)}`);
}

function ensureProductionStatus(value: unknown): ProductionStatus {
  if (typeof value === "string") {
    const normalized = value.toLowerCase() as ProductionStatus;
    if (PRODUCTION_STATUS_VALUES.has(normalized)) {
      return normalized;
    }
  }
  return ProductionStatus.Producing;
}

function ensureAssetStatus(value: unknown): Asset["status"] {
  if (typeof value === "string") {
    const normalized = value.toLowerCase() as Asset["status"];
    if (ASSET_STATUS_VALUES.includes(normalized)) {
      return normalized;
    }
  }
  return "producing";
}

function ensureMetadata(value: unknown, fallback: Metadata): Metadata {
  if (
    value &&
    typeof value === "object" &&
    "createdAt" in value &&
    "updatedAt" in value
  ) {
    const metadata = value as Partial<Metadata>;
    if (
      typeof metadata.createdAt === "string" &&
      typeof metadata.updatedAt === "string"
    ) {
      return {
        createdAt: metadata.createdAt as Metadata["createdAt"],
        updatedAt: metadata.updatedAt as Metadata["updatedAt"],
      };
    }
  }
  return fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return fallback;
}

function toString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function toIsoDate(value: unknown): ISODateTimeString {
  const str = toString(value);
  if (str) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString() as ISODateTimeString;
    }
  }
  return new Date().toISOString() as ISODateTimeString;
}

function normalizePayoutData(
  entries?: PinnedMetadataPayoutEntry[],
): PayoutData[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  const result: PayoutData[] = [];
  for (const entry of entries) {
    const month = ensureYearMonth(entry?.month);
    const payout = entry?.tokenPayout ?? {};
    result.push({
      month,
      tokenPayout: {
        totalPayout: toNumber(payout.totalPayout),
        payoutPerToken: toNumber(payout.payoutPerToken),
        txHash: toString(payout.txHash),
        orderHash: toString(payout.orderHash),
      },
    });
  }
  return result;
}

function toMergePayoutRecords(
  entries?: PinnedMetadataPayoutEntry[],
): MergePayoutRecord[] {
  return normalizePayoutData(entries).map((entry) => ({
    month: entry.month,
    tokenPayout: { payoutPerToken: entry.tokenPayout.payoutPerToken },
  }));
}

function normalizeReceiptsData(
  receipts: PinnedMetadataReceiptsRecord[] | undefined,
): ReceiptsData[] {
  if (!Array.isArray(receipts)) {
    return [];
  }
  return receipts.map((record) => ({
    month: ensureYearMonth(record?.month),
    assetData: {
      production: toNumber(record?.assetData?.production ?? record?.production),
      revenue: toNumber(record?.assetData?.revenue ?? record?.revenue),
      expenses: toNumber(record?.assetData?.expenses ?? record?.expenses),
      netIncome: toNumber(record?.assetData?.netIncome ?? record?.netIncome),
    },
    realisedPrice: {
      oilPrice: toNumber(record?.realisedPrice?.oilPrice),
      gasPrice: toNumber(record?.realisedPrice?.gasPrice),
    },
  }));
}

function normalizeHistoricalProduction(
  history: PinnedMetadataAsset["historicalProduction"],
): MetadataHistoricalRecord[] {
  if (!Array.isArray(history)) {
    return [];
  }
  return history.map((entry) => ({
    month: ensureYearMonth(entry?.month),
    production: toNumber(entry?.production),
  }));
}

function ensureDocumentType(value: unknown): DocumentType {
  if (typeof value === "string") {
    const normalized = value.toLowerCase() as DocumentType;
    if (Object.values(DocumentType).includes(normalized)) {
      return normalized;
    }
  }
  return DocumentType.PDF;
}

function normalizeDocuments(documents: unknown): MetadataDocument[] {
  if (!Array.isArray(documents)) {
    return [];
  }
  return documents.map((doc) => ({
    name: toString(doc.name),
    type: ensureDocumentType((doc as { type?: unknown }).type),
    ipfs: toString(doc.ipfs),
  }));
}

function normalizeOperationalMetricsToken(
  metrics: PinnedMetadataAsset["operationalMetrics"],
): AssetData["operationalMetrics"] {
  const fallback: AssetData["operationalMetrics"] = {
    uptime: { percentage: 0, period: "unknown" },
    hseMetrics: {
      incidentFreeDays: 0,
      lastIncidentDate: new Date().toISOString() as ISODateTimeString,
    },
  };

  if (!metrics || typeof metrics !== "object") {
    return fallback;
  }

  const metricsRecord = metrics as Record<string, unknown>;
  const uptimeRecord =
    typeof metricsRecord.uptime === "object" && metricsRecord.uptime
      ? (metricsRecord.uptime as Record<string, unknown>)
      : {};
  const hseRecord =
    typeof metricsRecord.hseMetrics === "object" && metricsRecord.hseMetrics
      ? (metricsRecord.hseMetrics as Record<string, unknown>)
      : {};

  return {
    uptime: {
      percentage: toNumber(uptimeRecord.percentage),
      period: toString(uptimeRecord.period, "unknown"),
    },
    hseMetrics: {
      incidentFreeDays: toNumber(hseRecord.incidentFreeDays),
      lastIncidentDate: toIsoDate(hseRecord.lastIncidentDate),
    },
  };
}

function buildTokenAssetData(asset: PinnedMetadataAsset): AssetData {
  const locationWaterDepth = asset.location?.waterDepth;
  return {
    assetName: toString(asset.assetName),
    description: toString(asset.description),
    location: {
      state: toString(asset.location?.state),
      county: toString(asset.location?.county),
      country: toString(asset.location?.country),
      coordinates: {
        lat: toNumber(asset.location?.coordinates?.lat),
        lng: toNumber(asset.location?.coordinates?.lng),
      },
      waterDepth:
        locationWaterDepth === undefined || locationWaterDepth === null
          ? null
          : toString(locationWaterDepth),
    },
    operator: {
      name: toString(asset.operator?.name),
      website: toString(asset.operator?.website),
      experienceYears: toNumber(asset.operator?.experience, 0),
    },
    technical: {
      fieldType: toString(asset.technical?.fieldType),
      license: toString(asset.technical?.license),
      firstOil: ensureYearMonth(asset.technical?.firstOil),
      infrastructure: toString(asset.technical?.infrastructure),
      environmental: toString(asset.technical?.environmental),
      expectedEndDate: ensureYearMonth(asset.technical?.expectedEndDate),
      crudeBenchmark: toString(asset.technical?.crudeBenchmark),
      pricing: {
        benchmarkPremium: toNumber(asset.technical?.pricing?.benchmarkPremium),
        transportCosts: toNumber(asset.technical?.pricing?.transportCosts),
      },
    },
    assetTerms: {
      interestType: toString(asset.assetTerms?.interestType),
      amount: toNumber(asset.assetTerms?.amount),
      paymentFrequencyDays: toNumber(asset.assetTerms?.paymentFrequencyDays),
    },
    status: ensureProductionStatus(asset.production?.status),
    plannedProduction: {
      oilPriceAssumption: toNumber(asset.plannedProduction?.oilPriceAssumption),
      oilPriceAssumptionCurrency:
        toString(asset.plannedProduction?.oilPriceAssumptionCurrency) || "USD",
      projections:
        asset.plannedProduction?.projections?.map((projection) => ({
          month: ensureYearMonth(projection?.month),
          production: toNumber(projection?.production),
          revenue: projection?.revenue
            ? toNumber(projection.revenue)
            : undefined,
        })) ?? [],
    } as MetadataPlannedProduction,
    historicalProduction: normalizeHistoricalProduction(
      asset.historicalProduction,
    ),
    receiptsData: normalizeReceiptsData(asset.receiptsData),
    operationalMetrics: normalizeOperationalMetricsToken(
      asset.operationalMetrics,
    ),
    documents: normalizeDocuments(
      (asset as { documents?: MetadataDocument[] }).documents,
    ),
    coverImage: asset.coverImage ? `${PINATA_GATEWAY}/${asset.coverImage}` : "",
    galleryImages:
      asset.galleryImages?.map((image) => ({
        url: image?.url ? `${PINATA_GATEWAY}/${image.url}` : "",
        title: toString(image?.title),
        caption: toString(image?.caption),
      })) ?? [],
  };
}

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
  protected validateMetadata(
    metadata: Record<string, unknown>,
    requiredFields: string[],
  ): void {
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
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>((current, key) => {
      if (
        current !== null &&
        typeof current === "object" &&
        !Array.isArray(current) &&
        key in current
      ) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}

/**
 * Transform SFT data to Token type
 */
export class TokenTransformer extends BaseSftTransformer {
  transform(
    sft: OffchainAssetReceiptVault,
    pinnedMetadata: PinnedMetadata,
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
      sharePercentage:
        typeof pinnedMetadata.sharePercentage === "number"
          ? pinnedMetadata.sharePercentage
          : 0,
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
    pinnedMetadata: PinnedMetadata,
    _maxSupply: string,
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

    if (
      pinnedMetadata.payoutData !== undefined &&
      !Array.isArray(pinnedMetadata.payoutData)
    ) {
      throw new Error("Invalid payoutData - must be an array");
    }

    const baseMetadata = this.createMetadataTimestamps(sft);
    if (!pinnedMetadata.asset) {
      throw new Error("Token metadata missing asset details");
    }
    const assetMetadata = pinnedMetadata.asset;
    const releaseName = toString(pinnedMetadata.releaseName);
    if (!releaseName) {
      throw new Error("Invalid releaseName in metadata");
    }

    const tokenMetadata: TokenMetadata = {
      contractAddress: sft.id,
      symbol: sft.symbol,
      releaseName,
      tokenType: ensureTokenType(pinnedMetadata.tokenType),
      firstPaymentDate: ensureYearMonth(pinnedMetadata.firstPaymentDate),
      sharePercentage: pinnedMetadata.sharePercentage,
      payoutData: normalizePayoutData(pinnedMetadata.payoutData),
      asset: buildTokenAssetData(assetMetadata),
      metadata: ensureMetadata(pinnedMetadata.metadata, baseMetadata),
    };

    return tokenMetadata;
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

  transform(
    sft: OffchainAssetReceiptVault,
    pinnedMetadata: PinnedMetadata,
  ): Asset {
    // Validate required fields
    this.validateMetadata(pinnedMetadata, this.REQUIRED_FIELDS);

    const assetData = pinnedMetadata.asset;
    if (!assetData) {
      throw new Error("Missing asset metadata");
    }
    // Build merged monthly reports first so we can derive current production
    const monthlyReports = this.transformMonthlyReports(
      assetData,
      pinnedMetadata,
    );

    const assetStatus = ensureAssetStatus(assetData.production?.status);
    const assetTerms = this.transformTerms(assetData.assetTerms);
    const metadataTimestamps = this.createMetadataTimestamps(sft);

    const asset: Asset = {
      id: sft.id,
      name: toString(assetData.assetName) || sft.name,
      description: toString(assetData.description),
      coverImage: this.formatImageUrl(assetData.coverImage),
      images: this.formatGalleryImages(assetData.galleryImages),
      galleryImages: this.formatGalleryImages(assetData.galleryImages),
      location: this.transformLocation(assetData.location),
      operator: this.transformOperator(assetData.operator),
      technical: this.transformTechnical(assetData.technical),
      status: assetStatus,
      terms: assetTerms,
      assetTerms: assetTerms,
      tokenContracts: [sft.id],
      monthlyReports,
      plannedProduction: this.transformPlannedProduction(
        assetData.plannedProduction,
      ),
      operationalMetrics: this.transformOperationalMetrics(
        assetData.operationalMetrics,
      ),
      metadata: metadataTimestamps,
    };

    return asset;
  }

  private formatImageUrl(imageHash?: string): string {
    return imageHash ? `${PINATA_GATEWAY}/${imageHash}` : "";
  }

  private formatGalleryImages(
    images?: PinnedMetadataGalleryImage[],
  ): Array<{ title: string; url: string; caption: string }> {
    if (!Array.isArray(images)) return [];

    return images.map((image) => ({
      title: image?.title || "",
      url: image?.url ? `${PINATA_GATEWAY}/${image.url}` : "",
      caption: image?.caption || "",
    }));
  }

  private transformLocation(
    location?: PinnedMetadataAsset["location"],
  ): Asset["location"] {
    if (!location) {
      return {
        state: "",
        county: "",
        country: "",
        coordinates: { lat: 0, lng: 0 },
        waterDepth: null,
      };
    }

    return {
      state: toString(location.state),
      county: toString(location.county),
      country: toString(location.country),
      coordinates: {
        lat: toNumber(location.coordinates?.lat),
        lng: toNumber(location.coordinates?.lng),
      },
      waterDepth:
        location.waterDepth === null || location.waterDepth === undefined
          ? null
          : toString(location.waterDepth),
    };
  }

  private transformOperator(
    operator?: PinnedMetadataAsset["operator"],
  ): Asset["operator"] {
    return {
      name: toString(operator?.name),
      website: toString(operator?.website),
      experience:
        operator?.experience !== undefined && operator?.experience !== null
          ? String(operator.experience)
          : "",
    };
  }

  private transformTechnical(
    technical?: PinnedMetadataAsset["technical"],
  ): Asset["technical"] {
    return {
      fieldType: toString(technical?.fieldType),
      depth: toString(technical?.depth),
      license: toString(technical?.license),
      estimatedLife: toString(technical?.estimatedLife),
      firstOil: toString(technical?.firstOil),
      infrastructure: toString(technical?.infrastructure),
      environmental: toString(technical?.environmental),
      expectedEndDate: toString(technical?.expectedEndDate),
      crudeBenchmark: toString(technical?.crudeBenchmark),
      pricing: {
        benchmarkPremium: toString(technical?.pricing?.benchmarkPremium ?? "0"),
        transportCosts: toString(technical?.pricing?.transportCosts ?? "0"),
      },
    };
  }

  private transformProduction(
    assetData: PinnedMetadataAsset,
    mergedMonthlyReports: Array<{ production?: number }>,
  ) {
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

  private transformTerms(
    assetTerms?: PinnedMetadataAsset["assetTerms"],
  ): Asset["terms"] {
    return {
      interestType: toString(assetTerms?.interestType),
      amount: toString(assetTerms?.amount ?? ""),
      paymentFrequency: toString(assetTerms?.paymentFrequencyDays ?? ""),
    };
  }

  private transformMonthlyReports(
    assetData: PinnedMetadataAsset,
    pinnedMetadata: PinnedMetadata,
  ) {
    const historical: MergeHistoricalRecord[] = Array.isArray(
      assetData.historicalProduction,
    )
      ? assetData.historicalProduction.map((record) => ({
          month: ensureYearMonth(record?.month),
          production: toNumber(record?.production),
        }))
      : [];

    const receipts: MergeReceiptsRecord[] = Array.isArray(
      assetData.receiptsData,
    )
      ? assetData.receiptsData.map((record) => ({
          month: ensureYearMonth(record?.month),
          assetData: {
            production: toNumber(
              record?.assetData?.production ?? record?.production,
            ),
            revenue: toNumber(record?.assetData?.revenue ?? record?.revenue),
            expenses: toNumber(record?.assetData?.expenses ?? record?.expenses),
            netIncome: toNumber(
              record?.assetData?.netIncome ?? record?.netIncome,
            ),
          },
          production: toNumber(record?.production),
          revenue: toNumber(record?.revenue),
          expenses: toNumber(record?.expenses),
          netIncome: toNumber(record?.netIncome),
        }))
      : [];

    const payoutRecords = toMergePayoutRecords(pinnedMetadata?.payoutData);

    return mergeProductionHistory(historical, receipts, payoutRecords);
  }

  private transformPlannedProduction(
    plannedProduction: PinnedMetadataAsset["plannedProduction"],
  ): PlannedProduction {
    return {
      oilPriceAssumption: toNumber(plannedProduction?.oilPriceAssumption),
      oilPriceAssumptionCurrency:
        toString(plannedProduction?.oilPriceAssumptionCurrency) || "USD",
      projections:
        plannedProduction?.projections?.map((projection) => ({
          month: toString(projection?.month),
          production: toNumber(projection?.production),
        })) ?? [],
    };
  }

  private transformOperationalMetrics(
    metrics: PinnedMetadataAsset["operationalMetrics"],
  ) {
    const fallback: Asset["operationalMetrics"] = {
      uptime: { percentage: 0, period: "unknown" },
      hseMetrics: {
        incidentFreeDays: 0,
        lastIncidentDate: new Date().toISOString() as ISODateTimeString,
        safetyRating: "Unknown",
      },
    };

    if (!metrics || typeof metrics !== "object") {
      return fallback;
    }

    const metricsRecord = metrics as Record<string, unknown>;
    const uptimeRecord =
      typeof metricsRecord.uptime === "object" && metricsRecord.uptime
        ? (metricsRecord.uptime as Record<string, unknown>)
        : {};
    const hseRecord =
      typeof metricsRecord.hseMetrics === "object" && metricsRecord.hseMetrics
        ? (metricsRecord.hseMetrics as Record<string, unknown>)
        : {};

    return {
      uptime: {
        percentage: toNumber(uptimeRecord.percentage),
        period: toString(uptimeRecord.period, "unknown"),
      },
      hseMetrics: {
        incidentFreeDays: toNumber(hseRecord.incidentFreeDays),
        lastIncidentDate: toIsoDate(hseRecord.lastIncidentDate),
        safetyRating: hseRecord.safetyRating
          ? toString(hseRecord.safetyRating)
          : "Unknown",
      },
    };
  }
}

// Export singleton instances
export const tokenTransformer = new TokenTransformer();
export const tokenMetadataTransformer = new TokenMetadataTransformer();
export const assetTransformer = new AssetTransformer();
