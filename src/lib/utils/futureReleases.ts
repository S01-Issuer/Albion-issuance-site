import { ENERGY_FIELDS } from "$lib/network";
import { catalogService } from "$lib/services";

/**
 * Check if an energy field has incomplete releases (< 100% shares allocated)
 * @param assetId - The asset ID or energy field name to check
 * @returns Promise<boolean> - True if there are future releases available
 */
export async function hasIncompleteReleases(assetId: string): Promise<boolean> {
  // Find the matching energy field
  const energyField = ENERGY_FIELDS.find(
    (field) =>
      field.name === assetId ||
      field.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "") === assetId,
  );

  if (!energyField) return false;

  try {
    await catalogService.build();
    const allTokens = Object.values(catalogService.getCatalog()?.tokens || {});
    const fieldTokens = allTokens.filter((t) =>
      energyField.sftTokens.some(
        (s) => s.address.toLowerCase() === t.contractAddress.toLowerCase(),
      ),
    );
    if (fieldTokens.length === 0) return true; // If no tokens, assume future releases
    const totalSharePercentage = fieldTokens.reduce(
      (sum, t) => sum + (t.sharePercentage || 0),
      0,
    );
    return totalSharePercentage < 100;
  } catch (error) {
    console.error(`Error checking incomplete releases for ${assetId}:`, error);
    return false;
  }
}
