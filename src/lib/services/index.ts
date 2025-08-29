/**
 * @fileoverview Services index
 * Central export for all service classes and service infrastructure
 */

import assetService from "./AssetService";
import tokenService from "./TokenService";

// Export services
export { default as AssetService } from "./AssetService";
export { default as TokenService } from "./TokenService";
export { marketDataService } from "./MarketDataService";

// Service container interface
export interface ServiceContainer {
  assetService: typeof assetService;
  tokenService: typeof tokenService;
}

// Service container instance
export const serviceContainer: ServiceContainer = {
  assetService,
  tokenService,
};

// Export convenience functions for direct access
export const useAssetService = () => serviceContainer.assetService;
export const useTokenService = () => serviceContainer.tokenService;

// Export types
export type { MarketData, MarketIndicator } from "./MarketDataService";
