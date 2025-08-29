import { ENERGY_FIELDS } from "$lib/network";
import tokenService from "$lib/services/TokenService";

/**
 * Check if an energy field has incomplete releases (< 100% shares allocated)
 * @param assetId - The asset ID or energy field name to check
 * @returns Promise<boolean> - True if there are future releases available
 */
export async function hasIncompleteReleases(assetId: string): Promise<boolean> {
  // Find the matching energy field
  const energyField = ENERGY_FIELDS.find(field => 
    field.name === assetId ||
    field.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') === assetId
  );
  
  if (!energyField) return false;
  
  try {
    // Get all tokens for this energy field
    const tokens = tokenService.getTokensByEnergyField(energyField.name);
    if (!tokens || tokens.length === 0) return true; // If no tokens, assume future releases
    
    // Get metadata for each token to access share percentage
    const tokenMetadataPromises = tokens.map(token => 
      tokenService.getTokenMetadataByAddress(token.contractAddress)
    );
    
    const tokenMetadata = await Promise.all(tokenMetadataPromises);
    
    // Calculate total share percentage
    const totalSharePercentage = tokenMetadata.reduce((sum, metadata) => {
      return sum + (metadata?.sharePercentage || 0);
    }, 0);
    
    return totalSharePercentage < 100;
  } catch (error) {
    console.error(`Error checking incomplete releases for ${assetId}:`, error);
    return false;
  }
}