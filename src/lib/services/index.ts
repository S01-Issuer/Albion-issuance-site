/**
 * @fileoverview Services index
 * Central export for all service classes and service infrastructure
 */

import assetService from "./AssetService";
import tokenService from "./TokenService";
import { catalogService } from "./CatalogService";

// Export services
export { default as AssetService } from "./AssetService";
export { default as TokenService } from "./TokenService";
export { marketDataService } from "./MarketDataService";
export { catalogService } from "./CatalogService";

// Service container interface
export interface ServiceContainer {
  assetService: typeof assetService;
  tokenService: typeof tokenService;
  catalogService: typeof catalogService;
}

// Service container instance
export const serviceContainer: ServiceContainer = {
  assetService,
  tokenService,
  catalogService,
};

// Export convenience functions for direct access
export const useAssetService = () => serviceContainer.assetService;
export const useTokenService = () => serviceContainer.tokenService;
export const useCatalogService = () => serviceContainer.catalogService;

// Export types
export type { MarketData, MarketIndicator } from "./MarketDataService";
