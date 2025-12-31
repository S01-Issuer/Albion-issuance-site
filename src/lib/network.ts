import { PUBLIC_METABOARD_ADMIN } from "$env/static/public";
import { env as publicEnv } from "$env/dynamic/public";

export const BASE_SFT_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-base/1.0.5/gn";
export const BASE_ORDERBOOK_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2024-12-13-9c39/gn";
export const BASE_METADATA_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn";

const BASE_SFT_SUBGRAPH_FALLBACK_URL =
  publicEnv.PUBLIC_BASE_SFT_SUBGRAPH_FALLBACK_URL;
const BASE_ORDERBOOK_SUBGRAPH_FALLBACK_URL =
  publicEnv.PUBLIC_BASE_ORDERBOOK_SUBGRAPH_FALLBACK_URL;
const BASE_METADATA_SUBGRAPH_FALLBACK_URL =
  publicEnv.PUBLIC_BASE_METADATA_SUBGRAPH_FALLBACK_URL;

const isString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export const BASE_SFT_SUBGRAPH_URLS = [
  BASE_SFT_SUBGRAPH_URL,
  BASE_SFT_SUBGRAPH_FALLBACK_URL,
].filter(isString);
export const BASE_ORDERBOOK_SUBGRAPH_URLS = [
  BASE_ORDERBOOK_SUBGRAPH_URL,
  BASE_ORDERBOOK_SUBGRAPH_FALLBACK_URL,
].filter(isString);
export const BASE_METADATA_SUBGRAPH_URLS = [
  BASE_METADATA_SUBGRAPH_URL,
  BASE_METADATA_SUBGRAPH_FALLBACK_URL,
].filter(isString);
export const TARGET_NETWORK = "base";
export const PINATA_GATEWAY = "/api/ipfs";
export const ORDERBOOK_CONTRACT_ADDRESS =
  "0xd2938E7c9fe3597F78832CE780Feb61945c377d7";

export type Claim = {
  orderHash: string;
  csvLink: string;
  expectedMerkleRoot: string;
  expectedContentHash: string;
};

export type SftToken = {
  address: string;
  claims: Claim[];
};

export type EnergyField = {
  name: string;
  sftTokens: SftToken[];
};

// Environment-specific configurations
// For production, set PUBLIC_METABOARD_ADMIN=0x4E5Bd3Cf829010280F76754B49921d4e1448B8Cf in your .env
// For development/preview, set PUBLIC_METABOARD_ADMIN=0xD2843D9E7738d46D90CB6Dff8D6C83db58B9c165 in your .env
// This will be imported from sftRepository where environment variables are accessible
export const PRODUCTION_METABOARD_ADMIN =
  "0x4E5Bd3Cf829010280F76754B49921d4e1448B8Cf";
export const DEVELOPMENT_METABOARD_ADMIN =
  "0xD2843D9E7738d46D90CB6Dff8D6C83db58B9c165";

// Development/Preview energy fields
const DEV_ENERGY_FIELDS: EnergyField[] = [
  {
    name: "Bakken Horizon Field",
    sftTokens: [
      {
        address: "0xbcAd416434984Cca2b4a950dCd95f47C4126E980",
        claims: [
          {
            orderHash:
              "0xdf52f1dbb1f0d0a0d1e839e1a7beddbebccd724633e9a4b8b643290f33dcb770",
            csvLink: `${PINATA_GATEWAY}/bafkreic2d2jzsqnqhrarzd4pqgkfmge6vu32lzhkcpm45fzt6cxnfivmju`,
            expectedMerkleRoot:
              "0xe62355892574ae4c105123252df38ff60e427d93c06f7eb373821bb15ca4847a",
            expectedContentHash:
              "bafkreic2d2jzsqnqhrarzd4pqgkfmge6vu32lzhkcpm45fzt6cxnfivmju",
          },
        ],
      },
    ],
  },
  {
    name: "Gulf of Mexico-4",
    sftTokens: [
      {
        address: "0xae69a129b626b1e8fce196ef8e7d5faea3be753f",
        claims: [
          {
            orderHash:
              "0x3ede86a904f26911a1e71f35038142100096832c08f5edb8bf13b0eeda2395ed",
            csvLink: `${PINATA_GATEWAY}/bafkreic2d2jzsqnqhrarzd4pqgkfmge6vu32lzhkcpm45fzt6cxnfivmju`,
            expectedMerkleRoot:
              "0xe62355892574ae4c105123252df38ff60e427d93c06f7eb373821bb15ca4847a",
            expectedContentHash:
              "bafkreic2d2jzsqnqhrarzd4pqgkfmge6vu32lzhkcpm45fzt6cxnfivmju",
          },
        ],
      },
    ],
  },
];

// Production energy fields
const PROD_ENERGY_FIELDS: EnergyField[] = [
  {
    name: "Wressle-1 4.5% Royalty Stream",
    sftTokens: [
      {
        address: "0xf836a500910453A397084ADe41321ee20a5AAde1",
        claims: [
          {
            orderHash:
              "0x93f57975d7ecedcbd89aa74e0663e390c4afc7858d37a0d612a986042ae49ebb",
            csvLink: `${PINATA_GATEWAY}/bafkreigmivteh7rdu2orcascrqje5al52fq2a4yevrp4wjed6mvecqrywm`,
            expectedMerkleRoot:
              "0xce5cb11c41c2afae23a5406ffb032e9a2224f7da9dd6fc44a2af9be56f052bd0",
            expectedContentHash:
              "bafkreigmivteh7rdu2orcascrqje5al52fq2a4yevrp4wjed6mvecqrywm",
          },
          {
            orderHash:
              "0x51e95739a7cd184166038d09de803ca574cd03a13e60c2f7960459c9ae6684ec",
            csvLink: `${PINATA_GATEWAY}/bafkreibm6mrdbmbowc2qyw3gn3xygzmr3cj75gmmyc7apyxe34wfqzqjru`,
            expectedMerkleRoot:
              "0xb7a2297ccccc6dd6bd9960fd3325fadc34a656fc478827eeb06110c0983560a6",
            expectedContentHash:
              "bafkreibm6mrdbmbowc2qyw3gn3xygzmr3cj75gmmyc7apyxe34wfqzqjru",
          },
          {
            orderHash:
              "0x3b9902f8f9424e88c3c847ffb7337dc8b9a88fb4a2672d6bbfc8b12372eaebd2",
            csvLink: `${PINATA_GATEWAY}/bafkreidr2twhqtwwjkrcota6jvc2xij3povpz7wc4i5dnel3hl6gga5ohu`,
            expectedMerkleRoot:
              "0x0e7e29b1582fe6724b60f59d35066cf35318516aeb0b27b1f2c8b6d5fac6f40b",
            expectedContentHash:
              "bafkreidr2twhqtwwjkrcota6jvc2xij3povpz7wc4i5dnel3hl6gga5ohu",
          },
          {
            orderHash:
              "0x499f47f332cc4f375e3a34cea0e8e56f51c042b6d5be539c672fde855fab8df1",
            csvLink: `${PINATA_GATEWAY}/bafkreibqzcxpbdkxm6whawbpi47ngiemn77rmbmpswfbabhuogxos3ywbi`,
            expectedMerkleRoot:
              "0xbcfc4b9feff0c6eafefb6038585f5e6a581605582369423ca54bbfa22ed3c68d",
            expectedContentHash:
              "bafkreibqzcxpbdkxm6whawbpi47ngiemn77rmbmpswfbabhuogxos3ywbi",
          },
        ],
      },
      {
        address: "0x1d57246fd0ba134d7cc78ddf3ed829379d95f4b7",
        claims: [
          // Future claims
        ],
      },
    ],
  },
];

// Export a function to get the correct energy fields based on the metaboard admin
export function getEnergyFields(metaboardAdmin: string): EnergyField[] {
  return metaboardAdmin === PRODUCTION_METABOARD_ADMIN
    ? PROD_ENERGY_FIELDS
    : DEV_ENERGY_FIELDS;
}

// Export ENERGY_FIELDS based on the current PUBLIC_METABOARD_ADMIN env var
// This keeps all consumers consistent (homepage stats, catalog, claims, etc.)
export const ACTIVE_METABOARD_ADMIN =
  PUBLIC_METABOARD_ADMIN || DEVELOPMENT_METABOARD_ADMIN;
export const ENERGY_FIELDS = getEnergyFields(ACTIVE_METABOARD_ADMIN);
