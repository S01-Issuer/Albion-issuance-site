import type { Asset } from "$lib/types/uiTypes";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";
import { ENERGY_FIELDS } from "$lib/network";

export interface GroupedEnergyField {
  id: string; // URL-friendly identifier derived from asset name
  name: string;
  tokens: TokenMetadata[];
  asset: Asset;
}

/**
 * Groups tokens by ENERGY_FIELDS configuration - the canonical way to identify tokens from the same field
 * Each group contains all TokenMetadata that belong to the same energy field
 */
export function groupSftsByEnergyField(
  tokensWithAssets: Array<{ token: TokenMetadata; asset: Asset }>,
): GroupedEnergyField[] {
  const grouped: GroupedEnergyField[] = [];

  // Use ENERGY_FIELDS as the canonical source for grouping
  ENERGY_FIELDS.forEach((field) => {
    // Find all tokens that belong to this energy field
    const fieldTokens = tokensWithAssets.filter((item) =>
      field.sftTokens.some(
        (token) =>
          token.address.toLowerCase() ===
          item.token.contractAddress.toLowerCase(),
      ),
    );

    if (fieldTokens.length > 0) {
      // Create a URL-friendly ID from the field name
      const fieldId = field.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      grouped.push({
        id: fieldId,
        name: field.name,
        tokens: fieldTokens.map((item) => item.token),
        asset: fieldTokens[0].asset, // Will be updated below
      });
    }
  });

  // Update asset from the token with the latest updatedAt
  grouped.forEach((group) => {
    if (group.tokens.length > 0) {
      // Find the token with the latest updatedAt
      const latestToken = group.tokens.reduce((latest, current) => {
        const latestDate = new Date(latest.metadata?.updatedAt || 0);
        const currentDate = new Date(current.metadata?.updatedAt || 0);
        return currentDate > latestDate ? current : latest;
      });

      // Find the corresponding asset for this token
      const latestTokenWithAsset = tokensWithAssets.find(
        (item) =>
          item.token.contractAddress.toLowerCase() ===
          latestToken.contractAddress.toLowerCase(),
      );

      if (latestTokenWithAsset) {
        group.asset = latestTokenWithAsset.asset;
      }
    }
  });

  return grouped;
}

// Get energy field ID from contract address
export function getEnergyFieldId(contractAddress: string): string {
  // Find the energy field that contains this contract address
  const field = ENERGY_FIELDS.find((field) =>
    field.sftTokens.some(
      (token) => token.address.toLowerCase() === contractAddress.toLowerCase(),
    ),
  );

  if (field) {
    // Return URL-friendly version of the field name
    return field.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  // Fallback: return a URL-friendly version of the contract address
  return contractAddress.toLowerCase().replace(/^0x/, "").substring(0, 8);
}
