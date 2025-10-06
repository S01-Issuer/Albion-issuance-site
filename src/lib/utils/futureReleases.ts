import { ENERGY_FIELDS } from "$lib/network";
import { catalogService } from "$lib/services";

/**
 * Check if an energy field has incomplete releases (< 100% shares allocated)
 * @param assetId - The asset ID or energy field name to check
 * @returns Promise<boolean> - True if there are future releases available
 */
export async function hasIncompleteReleases(assetId: string): Promise<boolean> {
  console.warn(`[hasIncompleteReleases] Checking assetId: ${assetId}`);
  console.warn(
    `[hasIncompleteReleases] Available energy fields:`,
    ENERGY_FIELDS.map((f) => f.name),
  );

  // Find the matching energy field
  const energyField = ENERGY_FIELDS.find(
    (field) =>
      field.name === assetId ||
      field.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "") === assetId,
  );

  console.warn(`[hasIncompleteReleases] Found energy field:`, energyField?.name);

  if (!energyField) {
    console.warn(`[hasIncompleteReleases] No energy field found for ${assetId}`);
    return false;
  }

  try {
    await catalogService.build();
    const allTokens = Object.values(catalogService.getCatalog()?.tokens || {});
    const fieldTokens = allTokens.filter((t) =>
      energyField.sftTokens.some(
        (s) => s.address.toLowerCase() === t.contractAddress.toLowerCase(),
      ),
    );

    console.warn(
      `[hasIncompleteReleases] Found ${fieldTokens.length} tokens for field`,
    );
    console.warn(
      `[hasIncompleteReleases] Token share percentages:`,
      fieldTokens.map((t) => ({
        address: t.contractAddress,
        sharePercentage: t.sharePercentage,
      })),
    );

    if (fieldTokens.length === 0) {
      console.warn(
        `[hasIncompleteReleases] No tokens found, assuming future releases`,
      );
      return true; // If no tokens, assume future releases
    }

    const totalSharePercentage = fieldTokens.reduce(
      (sum, t) => sum + (t.sharePercentage || 0),
      0,
    );

    console.warn(
      `[hasIncompleteReleases] Total share percentage: ${totalSharePercentage}%`,
    );
    const hasIncomplete = totalSharePercentage < 100;
    console.warn(
      `[hasIncompleteReleases] Has incomplete releases: ${hasIncomplete}`,
    );

    return hasIncomplete;
  } catch (error) {
    console.error(
      `[hasIncompleteReleases] Error checking incomplete releases for ${assetId}:`,
      error,
    );
    return false;
  }
}
