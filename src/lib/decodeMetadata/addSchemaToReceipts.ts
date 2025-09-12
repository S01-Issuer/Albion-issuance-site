import { MAGIC_NUMBERS } from "./helpers";
import { cborDecode, bytesToMeta } from "./helpers";
import type { OffchainAssetReceiptVault } from "$lib/types/graphql";
import type { Asset, PlannedProduction, Token } from "$lib/types/uiTypes";
import { mergeProductionHistory } from "$lib/utils/productionMerge";
import type { ISODateTimeString } from "$lib/types/sharedTypes";
import { PINATA_GATEWAY } from "$lib/network";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";

export const addSchemaToReceipts = (vault: OffchainAssetReceiptVault) => {
  let tempSchema: { displayName: string; hash: string }[] = [];

  const receiptVaultInformations = vault.receiptVaultInformations || [];

  if (receiptVaultInformations.length) {
    receiptVaultInformations.map(async (data) => {
      const cborDecodedInformation = cborDecode(data.information.slice(18));
      if (
        cborDecodedInformation &&
        cborDecodedInformation[0]?.get(1) === MAGIC_NUMBERS.OA_SCHEMA
      ) {
        const schemaHash = cborDecodedInformation[1].get(0);
        if (schemaHash && !schemaHash.includes(",")) {
          const structure = bytesToMeta(
            cborDecodedInformation[0].get(0),
            "json",
          );

          tempSchema = [
            ...tempSchema,
            {
              ...structure,
              displayName: structure.displayName,
              timestamp: receiptVaultInformations[0].timestamp,
              id: receiptVaultInformations[0].id,
              hash: schemaHash,
            },
          ];
          tempSchema = tempSchema.filter(
            (d: { displayName?: string; hash?: string }) =>
              d.displayName && d.hash,
          );
          return tempSchema;
        }
      }
    });
  }
  return tempSchema;
};

export function generateTokenInstanceFromSft(
  sft: OffchainAssetReceiptVault,
  pinnedMetadata: any,
  sftMaxSharesSupply: string,
): Token {
  const tokenInstance: Token = {
    contractAddress: sft.id,
    name: sft.name,
    symbol: sft.symbol,
    decimals: 18, // All SFTs have default 18 decimals
    tokenType: "royalty", // SFTs are always royalty tokens, payment tokens are USDC, USDT or any other value token
    isActive: true, // SFTs are always active
    supply: {
      maxSupply: sftMaxSharesSupply.toString(),
      mintedSupply: sft.totalShares.toString(),
    },
    holders: sft.tokenHolders.map((holder) => ({
      address: holder.address,
      balance: holder.balance,
    })),
    payoutHistory: [], // Unclear what this is yet.
    sharePercentage: pinnedMetadata.sharePercentage, // Unclear what this is yet.
    firstPaymentDate: undefined, // Unclear what this is yet.
    metadata: {
      createdAt: (() => {
        const timestamp = Number(sft.deployTimestamp);
        if (isNaN(timestamp) || timestamp <= 0) {
          return new Date().toISOString() as ISODateTimeString;
        }
        return new Date(timestamp * 1000).toISOString() as ISODateTimeString;
      })(),
      updatedAt: (() => {
        const timestamp = Number(sft.deployTimestamp);
        if (isNaN(timestamp) || timestamp <= 0) {
          return new Date().toISOString() as ISODateTimeString;
        }
        return new Date(timestamp * 1000).toISOString() as ISODateTimeString;
      })(),
    },
  };

  return tokenInstance;
}

export function generateTokenMetadataInstanceFromSft(
  sft: OffchainAssetReceiptVault,
  pinnedMetadata: any,
  sftMaxSharesSupply: string,
): TokenMetadata {
  // Validate required fields exist
  if (!pinnedMetadata) {
    throw new Error("Missing pinnedMetadata");
  }

  if (!pinnedMetadata.asset || typeof pinnedMetadata.asset !== "object") {
    throw new Error("Missing or invalid asset data");
  }

  // Validate critical required fields - throw if missing
  if (
    !pinnedMetadata.releaseName ||
    typeof pinnedMetadata.releaseName !== "string"
  ) {
    throw new Error("Missing or invalid releaseName");
  }

  if (
    !pinnedMetadata.tokenType ||
    typeof pinnedMetadata.tokenType !== "string"
  ) {
    throw new Error("Missing or invalid tokenType");
  }

  if (
    typeof pinnedMetadata.sharePercentage !== "number" ||
    pinnedMetadata.sharePercentage < 0 ||
    pinnedMetadata.sharePercentage > 100
  ) {
    throw new Error("Missing or invalid sharePercentage");
  }

  if (
    !pinnedMetadata.firstPaymentDate ||
    typeof pinnedMetadata.firstPaymentDate !== "string"
  ) {
    throw new Error("Missing or invalid firstPaymentDate");
  }

  if (
    pinnedMetadata.payoutData !== undefined &&
    !Array.isArray(pinnedMetadata.payoutData)
  ) {
    throw new Error("Invalid payoutData - must be an array");
  }

  // Only create token instance if all validations pass
  const tokenInstance: TokenMetadata = {
    contractAddress: sft.id,
    symbol: sft.symbol,
    releaseName: pinnedMetadata.releaseName,
    tokenType: pinnedMetadata.tokenType,
    firstPaymentDate: pinnedMetadata.firstPaymentDate,
    sharePercentage: pinnedMetadata.sharePercentage,
    decimals:
      typeof pinnedMetadata.decimals === "number"
        ? pinnedMetadata.decimals
        : 18,
    supply: {
      maxSupply: sftMaxSharesSupply.toString(),
      mintedSupply: sft.totalShares.toString(),
    },
    payoutData: pinnedMetadata.payoutData || [],
    asset: {
      ...(pinnedMetadata.asset || {}),
      status: pinnedMetadata.asset?.production?.status || "producing",
    },
    metadata: pinnedMetadata.metadata || {
      createdAt: (() => {
        const timestamp = Number(sft.deployTimestamp);
        if (isNaN(timestamp) || timestamp <= 0) {
          return new Date().toISOString();
        }
        return new Date(timestamp * 1000).toISOString();
      })(),
      updatedAt: (() => {
        const timestamp = Number(sft.deployTimestamp);
        if (isNaN(timestamp) || timestamp <= 0) {
          return new Date().toISOString();
        }
        return new Date(timestamp * 1000).toISOString();
      })(),
    },
  };

  return tokenInstance;
}

export function generateAssetInstanceFromSftMeta(
  sft: OffchainAssetReceiptVault,
  pinnedMetadata: any,
): Asset {
  // Validate required fields
  if (!pinnedMetadata || !pinnedMetadata.asset) {
    throw new Error("Missing or invalid asset data in metadata");
  }

  const asset = pinnedMetadata.asset;

  // Validate critical asset fields
  if (!asset.assetName || typeof asset.assetName !== "string") {
    throw new Error("Missing or invalid assetName");
  }

  if (!asset.location || typeof asset.location !== "object") {
    throw new Error("Missing or invalid location data");
  }

  if (!asset.operator || typeof asset.operator !== "object") {
    throw new Error("Missing or invalid operator data");
  }

  if (!asset.technical || typeof asset.technical !== "object") {
    throw new Error("Missing or invalid technical data");
  }

  // production object is optional; we derive current production from merged history and carry status separately

  if (!asset.assetTerms || typeof asset.assetTerms !== "object") {
    throw new Error("Missing or invalid assetTerms data");
  }

  // Safely access nested properties with defaults
  const assetPlannedProduction: PlannedProduction = {
    oilPriceAssumption: asset.plannedProduction?.oilPriceAssumption || 0,
    oilPriceAssumptionCurrency:
      asset.plannedProduction?.oilPriceAssumptionCurrency || "USD",
    projections: asset.plannedProduction?.projections || [],
  };
  // Build merged monthly reports first (historical + later receipts)
  const monthlyReports: Asset["monthlyReports"] = mergeProductionHistory(
    asset.historicalProduction,
    asset.receiptsData,
    pinnedMetadata?.payoutData,
  );

  const assetInstance: Asset = {
    id: sft.id, // Use contract address as ID since we're not using assetId
    name: asset.assetName,
    description: asset.description || "",
    coverImage: asset.coverImage ? `${PINATA_GATEWAY}/${asset.coverImage}` : "",
    images: Array.isArray(asset.galleryImages)
      ? asset.galleryImages.map((image: any) => ({
          title: image?.title || "",
          url: image?.url ? `${PINATA_GATEWAY}/${image.url}` : "",
          caption: image?.caption || "",
        }))
      : [],
    galleryImages: Array.isArray(asset.galleryImages)
      ? asset.galleryImages.map((image: any) => ({
          title: image?.title || "",
          url: image?.url ? `${PINATA_GATEWAY}/${image.url}` : "",
          caption: image?.caption || "",
        }))
      : [],
    location: {
      state: asset.location.state,
      county: asset.location.county,
      country: asset.location.country,
      coordinates: {
        lat: asset.location.coordinates?.lat || 0,
        lng: asset.location.coordinates?.lng || 0,
      },
      waterDepth: null,
    },
    operator: {
      name: asset.operator.name,
      website: asset.operator.website || "",
      experience: asset.operator.experience || "",
    },
    technical: {
      fieldType: asset.technical.fieldType,
      depth: asset.technical.depth,
      license: asset.technical.license,
      estimatedLife: asset.technical.estimatedLife,
      firstOil: asset.technical.firstOil,
      infrastructure: asset.technical.infrastructure,
      environmental: asset.technical.environmental,
      expectedEndDate: asset.technical.expectedEndDate,
      crudeBenchmark: asset.technical.crudeBenchmark,
      pricing: {
        benchmarkPremium: (
          asset.technical.pricing?.benchmarkPremium || 0
        ).toString(),
        transportCosts: (
          asset.technical.pricing?.transportCosts || 0
        ).toString(),
      },
    },
    // production removed from UI Asset; use top-level status
    status: asset.production?.status || "producing",
    terms: {
      interestType: asset.assetTerms.interestType,
      amount: asset.assetTerms.amount,
      paymentFrequency: asset.assetTerms.paymentFrequencyDays,
    },
    assetTerms: {
      interestType: asset.assetTerms.interestType,
      amount: asset.assetTerms.amount,
      paymentFrequency: asset.assetTerms.paymentFrequencyDays,
    },
    tokenContracts: [sft.id],
    monthlyReports,
    plannedProduction: assetPlannedProduction,
    operationalMetrics: asset.operationalMetrics || {
      // Keep UI defaults as before
      uptime: { percentage: 0, unit: "%", period: "unknown" },
      hseMetrics: {
        incidentFreeDays: 0,
        lastIncidentDate: new Date().toISOString(),
        safetyRating: "Unknown",
      },
    },
    metadata: {
      createdAt: (() => {
        const timestamp = Number(sft.deployTimestamp);
        if (isNaN(timestamp) || timestamp <= 0) {
          return new Date().toISOString() as ISODateTimeString;
        }
        return new Date(timestamp * 1000).toISOString() as ISODateTimeString;
      })(),
      updatedAt: (() => {
        const timestamp = Number(sft.deployTimestamp);
        if (isNaN(timestamp) || timestamp <= 0) {
          return new Date().toISOString() as ISODateTimeString;
        }
        return new Date(timestamp * 1000).toISOString() as ISODateTimeString;
      })(),
    },
  };

  return assetInstance;
}

export function getCalculatedRemainingProduction(asset: Asset): string {
  if (!asset?.plannedProduction?.projections) {
    return "TBD";
  }

  // Sum all production from planned production projections
  const totalProduction = asset.plannedProduction.projections.reduce(
    (sum, projection) => sum + projection.production,
    0,
  );

  // Convert to mboe (thousand barrels)
  const productionInMboe = totalProduction / 1000;

  // Format with appropriate precision
  if (productionInMboe >= 10) {
    return `${Math.round(productionInMboe * 10) / 10} mboe`;
  } else {
    return `${Math.round(productionInMboe * 100) / 100} mboe`;
  }
}
