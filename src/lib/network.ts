export const BASE_SFT_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-base/1.0.4/gn";
export const BASE_ORDERBOOK_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2024-12-13-9c39/gn";
export const BASE_METADATA_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn";
export const TARGET_NETWORK = "base";
export const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";
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

export const ENERGY_FIELDS: EnergyField[] = [
  {
    name: "Wressle-1 4.5% Royalty Stream",
    sftTokens: [
      {
        address: "0xf836a500910453A397084ADe41321ee20a5AAde1",
        claims: [
        ],
      },
    ],
  },
];
