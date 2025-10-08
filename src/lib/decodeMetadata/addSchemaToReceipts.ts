import { MAGIC_NUMBERS } from "./helpers";
import { cborDecode, bytesToMeta } from "./helpers";
import type { OffchainAssetReceiptVault } from "$lib/types/graphql";
import type { Asset, Token } from "$lib/types/uiTypes";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import type { PinnedMetadata } from "$lib/types/PinnedMetadata";
import {
  tokenTransformer,
  tokenMetadataTransformer,
  assetTransformer,
} from "$lib/data/transformers/sftTransformers";

const toStringSafe = (value: unknown, fallback = ""): string =>
  typeof value === "string"
    ? value
    : value === null || value === undefined
      ? fallback
      : String(value);

export const addSchemaToReceipts = (vault: OffchainAssetReceiptVault) => {
  let tempSchema: Array<{
    displayName: string;
    hash: string;
    timestamp?: string;
    id?: string;
  }> = [];

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

          if (structure && typeof structure === "object") {
            const record = structure as Record<string, unknown> & {
              displayName?: string;
            };
            tempSchema = [
              ...tempSchema,
              {
                ...record,
                displayName: toStringSafe(record.displayName),
                timestamp: receiptVaultInformations[0].timestamp,
                id: receiptVaultInformations[0].id,
                hash: schemaHash,
              },
            ];
            tempSchema = tempSchema.filter(
              (d: { displayName?: string; hash?: string }) =>
                Boolean(d.displayName) && Boolean(d.hash),
            );
            return tempSchema;
          }
        }
      }
    });
  }
  return tempSchema;
};

export function generateTokenInstanceFromSft(
  sft: OffchainAssetReceiptVault,
  pinnedMetadata: PinnedMetadata,
  sftMaxSharesSupply: string,
): Token {
  return tokenTransformer.transform(sft, pinnedMetadata, sftMaxSharesSupply);
}

export function generateTokenMetadataInstanceFromSft(
  sft: OffchainAssetReceiptVault,
  pinnedMetadata: PinnedMetadata,
  _sftMaxSharesSupply: string,
): TokenMetadata {
  return tokenMetadataTransformer.transform(
    sft,
    pinnedMetadata,
    _sftMaxSharesSupply,
  );
}

export function generateAssetInstanceFromSftMeta(
  sft: OffchainAssetReceiptVault,
  pinnedMetadata: PinnedMetadata,
): Asset {
  return assetTransformer.transform(sft, pinnedMetadata);
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
