/**
 * @fileoverview Services index
 * Central export for all service classes and service infrastructure
 */

import { catalogService } from "./CatalogService";
import { claimsService } from "./ClaimsService";

// Export services
export { marketDataService } from "./MarketDataService";
export { catalogService } from "./CatalogService";
export { claimsService } from "./ClaimsService";

// Service container interface
export interface ServiceContainer {
  catalogService: typeof catalogService;
  claimsService: typeof claimsService;
}

// Service container instance
export const serviceContainer: ServiceContainer = {
  catalogService,
  claimsService,
};

// Export convenience functions for direct access
export const useCatalogService = () => serviceContainer.catalogService;
export const useClaimsService = () => serviceContainer.claimsService;

// Export types
export type { MarketData, MarketIndicator } from "./MarketDataService";
