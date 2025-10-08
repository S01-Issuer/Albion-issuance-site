// Shared test utilities for integration-style E2E tests

import { writable, type Writable } from "svelte/store";
import { sfts, sftMetadata } from "$lib/stores";
import type { MetaV1S, OffchainAssetReceiptVault } from "$lib/types/graphql";

export const TEST_WALLET = "0x1111111111111111111111111111111111111111";

// Minimal ENERGY_FIELDS fixture derived from the user-provided dataset
export const ENERGY_FIELDS_FIXTURE = [
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
              "https://gateway.pinata.cloud/ipfs/bafkreicjcemmypds6d5c4lonwp56xb2ilzhkk7hty3y6fo4nvdkxnaibgu",
            expectedMerkleRoot:
              "0x9106f7da38da159feb494ee5d31ad388f9004545914ceda12e062b458ce3b3fe",
            expectedContentHash:
              "bafkreicjcemmypds6d5c4lonwp56xb2ilzhkk7hty3y6fo4nvdkxnaibgu",
          },
        ],
      },
    ],
  },
];

// Very small CSV sample (index,address,amount) with owner = TEST_WALLET
export const CSV_ROWS = [
  { index: "0", address: TEST_WALLET, amount: "1000000000000000000" }, // 1
  { index: "1", address: TEST_WALLET, amount: "2000000000000000000" }, // 2
  {
    index: "2",
    address: "0x2222222222222222222222222222222222222222",
    amount: "3000000000000000000",
  },
];

export function toWei(n: number): string {
  return BigInt(Math.floor(n * 1e18)).toString();
}

// Provide sfts store data for the addressed token
export function seedSftStoresForFixture() {
  // Minimal SFT shape the pages rely on
  const sftAddress = ENERGY_FIELDS_FIXTURE[0].sftTokens[0].address;
  sfts.set([
    {
      id: sftAddress,
      totalShares: toWei(1000),
      sharesSupply: toWei(1000),
      deployTimestamp: `${Math.floor(Date.now() / 1000)}`,
      symbol: "PBR1",
      name: "Permian Basin-3",
      tokenHolders: [],
      shareHolders: [],
      shareTransfers: [],
      receiptBalances: [],
      certifications: [],
      receiptVaultInformations: [],
      deposits: [],
      withdraws: [],
      activeAuthorizer: { id: TEST_WALLET },
      address: sftAddress,
      admin: TEST_WALLET,
      deployer: TEST_WALLET,
      claimableDeposits: [],
      receiptTokens: [],
    } as unknown as OffchainAssetReceiptVault,
  ]);

  // sftMetadata is decoded via decodeSftInformation; we will mock that to return this shape
  sftMetadata.set([
    {
      id: "meta-1",
      subject: `0x000000000000000000000000${sftAddress.slice(2)}`,
      meta: "0x",
      metaHash: "0x",
      sender: TEST_WALLET,
    } as unknown as MetaV1S,
  ]);
}

// Create a mock of svelte-wagmi module exports for tests
export function mockWagmiModule() {
  const connected: Writable<boolean> = writable(true);
  const signerAddress: Writable<string> = writable(TEST_WALLET);
  const loading: Writable<boolean> = writable(false);
  const web3Modal: Writable<{ open: () => void }> = writable({
    open: () => {},
  });
  return {
    connected,
    signerAddress,
    loading,
    web3Modal,
    wagmiConfig: {} as Record<string, never>,
    chainId: writable(8453),
    disconnectWagmi: async () => {},
  };
}

// Trades fixture that matches the orderHash, includes transaction info, and a numeric amount
export function tradesFixture() {
  return [
    {
      order: {
        orderBytes: "0x",
        orderHash: ENERGY_FIELDS_FIXTURE[0].sftTokens[0].claims[0].orderHash,
      },
      orderbook: { id: "0xorderbook" },
      tradeEvent: {
        sender: TEST_WALLET,
        transaction: { id: "0xtrx", blockNumber: 100, timestamp: 1700000000 },
      },
      amount: 3000000000000000000, // 3
      sftAddress: ENERGY_FIELDS_FIXTURE[0].sftTokens[0].address,
    },
  ];
}

// A simple sortClaimsData result derived from CSV_ROWS for the TEST_WALLET
export function sortClaimsDataResult() {
  const totalClaimed = BigInt(CSV_ROWS[0].amount); // 1
  const totalUnclaimed = BigInt(CSV_ROWS[1].amount); // 2
  const total = totalClaimed + totalUnclaimed; // 3

  return {
    claimedCsv: [
      {
        ...CSV_ROWS[0],
        claimed: true,
        decodedLog: { timestamp: new Date("2024-01-01").toISOString() },
      },
    ],
    unclaimedCsv: [{ ...CSV_ROWS[1], claimed: false }],
    claims: [
      {
        date: new Date("2024-01-01").toISOString(),
        amount: "1",
        asset: ENERGY_FIELDS_FIXTURE[0].name,
        txHash: "0xtrx",
        status: "completed",
      },
    ],
    holdings: [
      {
        id: CSV_ROWS[1].index,
        name: ENERGY_FIELDS_FIXTURE[0].name,
        location: "",
        unclaimedAmount: "2",
        totalEarned: "3",
        lastPayout: new Date("2024-01-01").toISOString(),
        lastClaimDate: "",
        status: "producing",
      },
    ],
    totalClaims: 2,
    claimedCount: 1,
    unclaimedCount: 1,
    totalClaimedAmount: totalClaimed.toString(),
    totalUnclaimedAmount: totalUnclaimed.toString(),
    totalEarned: total.toString(),
    ownerAddress: TEST_WALLET,
  };
}

// Pinned metadata returned by decodeSftInformation mock
export function pinnedMetadataFixture() {
  const sftAddress = ENERGY_FIELDS_FIXTURE[0].sftTokens[0].address;
  return {
    contractAddress: `0x000000000000000000000000${sftAddress.slice(2)}`,
    symbol: "PBR1",
    releaseName: "Permian Basin-3 Release 1",
    tokenType: "royalty",
    firstPaymentDate: "2024-01-01",
    sharePercentage: 10,
    payoutData: [],
    asset: {
      assetName: "Permian Basin-3",
      description: "Test asset",
      coverImage: "",
      galleryImages: [],
      location: { state: "TX", county: "Reeves", country: "USA" },
      operator: { name: "Operator", website: "", experience: "" },
      technical: {
        fieldType: "Oil",
        depth: 0,
        license: "",
        estimatedLife: "",
        firstOil: "",
        infrastructure: "",
        environmental: "",
        expectedEndDate: "",
        crudeBenchmark: "",
        pricing: { benchmarkPremium: 0, transportCosts: 0 },
      },
      production: {
        current: "0",
        status: "producing",
        units: { production: 0, revenue: 0 },
      },
      assetTerms: {
        interestType: "royalty",
        amount: 0,
        paymentFrequencyDays: 30,
      },
      plannedProduction: {
        oilPriceAssumption: 0,
        oilPriceAssumptionCurrency: "USD",
        projections: [],
      },
      historicalProduction: [],
    },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}
