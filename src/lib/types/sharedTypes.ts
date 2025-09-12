/**
 * Shared type definitions used across both data and UI layers
 */

export interface GalleryImage {
  title: string;
  url: string;
  caption?: string;
}

export interface TokenSupply {
  maxSupply: string; // BigInt as string
  mintedSupply: string; // BigInt as string
}

export interface Coordinates {
  lat: number;
  lng: number;
}

// Common date format types
export type ISODateString = string; // ISO 8601 format

// More specific ISO date string types with template literal patterns
export type ISODateTimeString =
  `${number}-${number}-${number}T${number}:${number}:${number}.${number}Z`;
export type ISODateOnlyString = `${number}-${number}-${number}`;
export type ISOYearMonthString = `${number}-${number}`;

export interface Location {
  state: string;
  county: string;
  country: string;
  coordinates: Coordinates;
  waterDepth: string | null;
}

export interface Metadata {
  createdAt: ISODateTimeString; // ISO 8601 datetime string
  updatedAt: ISODateTimeString; // ISO 8601 datetime string
}

export interface PricingInfo {
  benchmarkPremium: number | string;
  transportCosts: number | string;
}
