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

// Environment-specific configurations
// For production, set PUBLIC_METABOARD_ADMIN=0x4E5Bd3Cf829010280F76754B49921d4e1448B8Cf in your .env
// For development/preview, set PUBLIC_METABOARD_ADMIN=0xD2843D9E7738d46D90CB6Dff8D6C83db58B9c165 in your .env
// This will be imported from sftRepository where environment variables are accessible
export const PRODUCTION_METABOARD_ADMIN = "0x4E5Bd3Cf829010280F76754B49921d4e1448B8Cf";
export const DEVELOPMENT_METABOARD_ADMIN = "0xD2843D9E7738d46D90CB6Dff8D6C83db58B9c165";

// Development/Preview energy fields
const DEV_ENERGY_FIELDS: EnergyField[] = [
  {
    name: "Bakken Horizon Field",
    sftTokens: [
      {
        address: "0xd5316ca888491575befc0273a00de2186c53f760",
        claims: [
          {
            orderHash:
              "0x6279ea463fdbf12dbaedfe39cf2c59d56e4c078fd0d67f20b165e9d7a73e1fe2",
            csvLink:
              `${PINATA_GATEWAY}/bafkreiceeasgwffk27kvrgfh4dihiekb7iiznqyjpbabavjrucymv2pobe`,
            expectedMerkleRoot: "0x8f63a9d57072ae06cdf6bce272c86892ba31dc5bf2df4cf0743679748d2583d0",
            expectedContentHash: "bafkreiceeasgwffk27kvrgfh4dihiekb7iiznqyjpbabavjrucymv2pobe"
          },
          {
            orderHash:
              "0x14d9c48cdbaf5307a628a16532e80f4bb054bfdcf8fce383f308a5fc13abcaa5",
            csvLink:
              `${PINATA_GATEWAY}/bafkreidtqov24bkl6ylcjqbt2pjhx5ya7glezwnnnln7hwu7cyq6jhxnzi`,
            expectedMerkleRoot: "0xdbe4d64a9f4713de098a4fd2a9c747a907fd4256972ed0f3dc080cff3d65786d",
            expectedContentHash: "bafkreidtqov24bkl6ylcjqbt2pjhx5ya7glezwnnnln7hwu7cyq6jhxnzi"
          },
        ],
      },
      {
        address: "0xea9a6f77483a07bc287dfb8dad151042376eb153",
        claims: [
          {
            orderHash:
              "0x992364ccc51fd07cde7f1940a73740a13f27ca853250997e99147fac7f95f446",
            csvLink:
              `${PINATA_GATEWAY}/bafkreiea3bziwveo2nhbcui4jdxx4m42b3fs3ekyu45n7hdabhadqpf3ki`,
            expectedMerkleRoot: "0x092668a04aca58371b3d1c7fa603f62a14d63684ade4a6143094c24fb69e97f2",
            expectedContentHash: "bafkreiea3bziwveo2nhbcui4jdxx4m42b3fs3ekyu45n7hdabhadqpf3ki"
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
              "0xa4d540c50f8409d2cafb6ae0cbff0bd8fb18c666981cf02269524215f16da4ac",
            csvLink:
              `${PINATA_GATEWAY}/bafkreihov36lw43igwx6fcy7iguconfi4vzjnbdppoqt4zb72ydygtvfey`,
            expectedMerkleRoot: "0x4da347e6e843edb490d901424ac7817869bf05301f70f35ef1bbe52e417dcecb",
            expectedContentHash: "bafkreihov36lw43igwx6fcy7iguconfi4vzjnbdppoqt4zb72ydygtvfey"
          },
        ],
      },
    ],
  },
  {
    name: "Permian Basin-3 Release 1",
    sftTokens: [
      {
        address: "0xc699575fe18f00104d926f0167cd858ce6d8b32e",
        claims: [
          {
            orderHash:
              "0x43ec2493caed6b56cfcbcf3b9279a01aedaafbce509598dfb324513e2d199977",
            csvLink:
              `${PINATA_GATEWAY}/bafkreicjcemmypds6d5c4lonwp56xb2ilzhkk7hty3y6fo4nvdkxnaibgu`,
            expectedMerkleRoot: "0x9106f7da38da159feb494ee5d31ad388f9004545914ceda12e062b458ce3b3fe",
            expectedContentHash: "bafkreicjcemmypds6d5c4lonwp56xb2ilzhkk7hty3y6fo4nvdkxnaibgu"
          },
        ],
      },
    ],
  },
  {
    name: "Q-10A North Sea Gas Field",
    sftTokens: [
      {
        address: "0x79db6526335ebb7afc122e53cc3a29f4c64e0483",
        claims: [
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
        ],
      },
    ],
  },
];

// Export a function to get the correct energy fields based on the metaboard admin
export function getEnergyFields(metaboardAdmin: string): EnergyField[] {
  return metaboardAdmin === PRODUCTION_METABOARD_ADMIN ? PROD_ENERGY_FIELDS : DEV_ENERGY_FIELDS;
}

// For backward compatibility, export the dev fields as default
export const ENERGY_FIELDS = DEV_ENERGY_FIELDS;
