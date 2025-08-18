/**
 * @fileoverview Services index
 * Central export for all service classes and service infrastructure
 */

import assetService from "./AssetService";
import tokenService from "./TokenService";
import { catalogService } from "./CatalogService";
import { claimsService } from "./ClaimsService";

// Export services
export { default as AssetService } from "./AssetService";
export { default as TokenService } from "./TokenService";
export { marketDataService } from "./MarketDataService";
export { catalogService } from "./CatalogService";
export { claimsService } from "./ClaimsService";

// Service container interface
export interface ServiceContainer {
  assetService: typeof assetService;
  tokenService: typeof tokenService;
  catalogService: typeof catalogService;
  claimsService: typeof claimsService;
}

// Service container instance
export const serviceContainer: ServiceContainer = {
  assetService,
  tokenService,
  catalogService,
  claimsService,
};

// Export convenience functions for direct access
export const useAssetService = () => serviceContainer.assetService;
export const useTokenService = () => serviceContainer.tokenService;
export const useCatalogService = () => serviceContainer.catalogService;
export const useClaimsService = () => serviceContainer.claimsService;

// Export types
export type { MarketData, MarketIndicator } from "./MarketDataService";
