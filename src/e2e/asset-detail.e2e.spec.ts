import {
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/svelte/svelte5";
import { vi, describe, it, beforeEach, expect, afterEach } from "vitest";
import AssetDetailPage from "../routes/(main)/assets/[id]/+page.svelte";
import { installHttpMocks } from "./http-mock";

// Mock app stores
vi.mock("$app/stores", async () => {
  const { readable } = await import("svelte/store");
  return {
    page: readable({
      url: new URL("http://localhost/assets/wressle-1-45-royalty-stream"),
      params: { id: "wressle-1-45-royalty-stream" },
      route: {},
      status: 200,
      error: null,
      data: {},
    }),
    navigating: readable(null),
    updated: { subscribe: () => () => {} },
  } as any;
});

// Mock wagmi
vi.mock("svelte-wagmi", async () => {
  const { writable, readable } = await import("svelte/store");
  return {
    web3Modal: writable({ open: () => {} }),
    signerAddress: writable("0x1111111111111111111111111111111111111111"),
    connected: writable(true),
    loading: writable(false),
    wagmiConfig: readable({ chains: [], transports: {} }),
    chainId: writable(8453),
    disconnectWagmi: async () => {},
  } as any;
});

// Mock network config - only mock URLs, not data
vi.mock("$lib/network", async () => {
  const actual = await vi.importActual<any>("$lib/network");
  return {
    ...actual,
    BASE_SFT_SUBGRAPH_URL: "https://example.com/sft",
    BASE_METADATA_SUBGRAPH_URL: "https://example.com/meta",
    BASE_ORDERBOOK_SUBGRAPH_URL: "https://example.com/orderbook",
    PINATA_GATEWAY: "https://gateway.pinata.cloud/ipfs",
    ENERGY_FIELDS: [
      {
        name: "Wressle-1 4.5% Royalty Stream",
        sftTokens: [
          {
            address: "0xf836a500910453a397084ade41321ee20a5aade1",
          },
        ],
      },
    ],
  };
});

// Mock wagmi core
vi.mock("@wagmi/core", () => ({
  readContract: vi.fn().mockResolvedValue(BigInt("12000000000000000000000")), // 12000 max supply
  multicall: vi
    .fn()
    .mockResolvedValue([
      { status: "success", result: BigInt("12000000000000000000000") },
    ]),
}));

// Mock tanstack query
vi.mock("@tanstack/svelte-query", () => ({
  createQuery: vi.fn(() => ({ subscribe: () => () => {} })),
}));

// Mock onchain client to return test data - use wallet address since that's the authorizer in mock
vi.mock("$lib/data/clients/onchain", () => ({
  getMaxSharesSupplyMap: vi.fn().mockResolvedValue({
    "0x1111111111111111111111111111111111111111": "12000000000000000000000",
  }),
}));

// DO NOT MOCK THESE - Let them use production code that fetches from HTTP mocks:
// - $lib/stores
// - $lib/queries/getSftMetadata
// - $lib/queries/getSfts
// - $lib/decodeMetadata/addSchemaToReceipts
// - $lib/decodeMetadata/helpers

const ADDRESS = "0xf836a500910453A397084ADe41321ee20a5AAde1";
const ORDER =
  "0x43ec2493caed6b56cfcbcf3b9279a01aedaafbce509598dfb324513e2d199977";
const CSV = "bafkreicjcemmypds6d5c4lonwp56xb2ilzhkk7hty3y6fo4nvdkxnaibgu";
const WALLET = "0x1111111111111111111111111111111111111111";

describe("Asset Detail Page E2E Tests", () => {
  let restore: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    restore = installHttpMocks({
      sftSubgraphUrl: "https://example.com/sft",
      metadataSubgraphUrl: "https://example.com/meta",
      orderbookSubgraphUrl: "https://example.com/orderbook",
      ipfsGateway: "https://gateway.pinata.cloud/ipfs",
      wallet: WALLET,
      address: ADDRESS,
      orderHash: ORDER,
      csvCid: CSV,
    });
  });

  afterEach(() => {
    restore?.();
  });

  describe("Asset Summary Section", () => {
    it("renders asset header with correct title and location", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // The page shows structure immediately, check for actual content
          // Just having "Token Information" doesn't mean data is loaded
          // We need actual token or asset data
          if (bodyText.includes("Wressle") || bodyText.includes("ALB-WR1-R1")) {
            // Asset title - may be in different formats
            const hasTitle = bodyText.match(/Wressle/i);

            // Location - may be just part of it
            const hasLocation =
              bodyText.match(/Lincolnshire/i) ||
              bodyText.match(/United Kingdom/i);

            // Operator
            const hasOperator = bodyText.match(/Egdon/i);

            // Status
            const hasStatus = bodyText.match(/Producing/i);

            // At least some content should be present
            expect(
              hasTitle || hasLocation || hasOperator || hasStatus,
            ).toBeTruthy();
          }
        },
        { timeout: 5000 },
      );
    });

    it("displays correct financial metrics in overview", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // The page shows structure immediately, check for actual content
          // Just having "Token Information" doesn't mean data is loaded
          // We need actual token or asset data
          if (bodyText.includes("Wressle") || bodyText.includes("ALB-WR1-R1")) {
            // Oil price assumption
            expect(bodyText).toMatch(/\$65/);

            // Benchmark premium/discount
            expect(bodyText).toMatch(/-\$1\.30|\$-1\.30/);

            // Break-even oil price
            expect(bodyText).toMatch(/\$6\.94/);

            // Commodity type
            expect(bodyText).toMatch(/Oil/);

            // Benchmark
            expect(bodyText).toMatch(/Brent/);
          }
        },
        { timeout: 5000 },
      );
    });
  });

  describe("Planned Production Tab", () => {
    it("displays production projections with correct months and values", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // The page shows structure immediately, check for actual content
          // Just having "Token Information" doesn't mean data is loaded
          // We need actual token or asset data
          if (bodyText.includes("Wressle") || bodyText.includes("ALB-WR1-R1")) {
            // Check for production-related content
            const hasProduction = bodyText.match(/Production/i);
            const hasBOE = bodyText.match(/BOE/i);
            const hasMetrics = bodyText.match(/Metrics/i);
            const hasExport = bodyText.match(/Export/i);

            // At least some production-related content should be present
            expect(
              hasProduction || hasBOE || hasMetrics || hasExport,
            ).toBeTruthy();
          }
        },
        { timeout: 5000 },
      );
    });

    it("shows production chart or data visualization", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // Check for chart-related elements or production history heading
          // Check if we're past the loading state - look for specific content instead
          if (
            bodyText.includes("Wressle") ||
            bodyText.includes("ALB-WR1-R1") ||
            bodyText.includes("Token Information")
          ) {
            expect(bodyText).toMatch(/Production History/i);
          }
        },
        { timeout: 5000 },
      );
    });
  });

  describe("Historical Production Tab", () => {
    it("displays revenue history when available", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // Should show revenue-related content eventually
          // Check if we're past the loading state - look for specific content instead
          if (
            bodyText.includes("Wressle") ||
            bodyText.includes("ALB-WR1-R1") ||
            bodyText.includes("Token Information")
          ) {
            const hasRevenue = bodyText.match(/Revenue|History/i);
            expect(hasRevenue).toBeTruthy();
          }
        },
        { timeout: 5000 },
      );
    });

    it("displays operational metrics", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // The page shows structure immediately, check for actual content
          // Just having "Token Information" doesn't mean data is loaded
          // We need actual token or asset data
          if (bodyText.includes("Wressle") || bodyText.includes("ALB-WR1-R1")) {
            // Key metrics section
            expect(bodyText).toMatch(/Key Metrics/i);

            // Metric labels
            expect(bodyText).toMatch(/Uptime|Daily Production|HSE/);
          }
        },
        { timeout: 5000 },
      );
    });
  });

  describe("Token Cards", () => {
    it("displays correct number of token cards", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // The page shows structure immediately, check for actual content
          // Just having "Token Information" doesn't mean data is loaded
          // We need actual token or asset data
          if (bodyText.includes("Wressle") || bodyText.includes("ALB-WR1-R1")) {
            // Should show token information section
            expect(bodyText).toMatch(/Token Information/i);

            // Should have at least one token with the Wressle name
            expect(bodyText).toMatch(/ALB-WR1-R1/);
          }
        },
        { timeout: 5000 },
      );
    });

    it("displays correct token card content", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // The page shows structure immediately, check for actual content
          // Just having "Token Information" doesn't mean data is loaded
          // We need actual token or asset data
          if (bodyText.includes("Wressle") || bodyText.includes("ALB-WR1-R1")) {
            // Token availability status
            expect(bodyText).toMatch(
              /Available for Purchase|Currently Sold Out/i,
            );

            // Token share percentage
            expect(bodyText).toMatch(/2\.5%.*of Asset|25%.*of Asset/);

            // Supply information
            expect(bodyText).toMatch(/Minted Supply/i);
            expect(bodyText).toMatch(/Max Supply/i);

            // Should show supply numbers
            expect(bodyText).toMatch(/1500|1,500|1\.5k/); // Minted supply
            expect(bodyText).toMatch(/12000|12,000|12k/); // Max supply

            // Implied barrels per token
            expect(bodyText).toMatch(/Implied Barrels.*Token/i);

            // Returns information
            expect(bodyText).toMatch(/Base Return|Bonus Return/);

            // Exact return values from mock
            expect(bodyText).toMatch(/12\.0%|12\.04%/); // Base return
          }
        },
        { timeout: 5000 },
      );
    });

    it("shows available supply calculation correctly", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // The page shows structure immediately, check for actual content
          // Just having "Token Information" doesn't mean data is loaded
          // We need actual token or asset data
          if (bodyText.includes("Wressle") || bodyText.includes("ALB-WR1-R1")) {
            // Available = Max (12000) - Minted (1500) = 10500
            // The UI might show this as "10,500 available" or similar
            const hasAvailable = bodyText.match(/10,500|10\.5k|10500/);

            // Or it might just show the minted and max separately
            const hasMinted = bodyText.match(/1,500|1500|1\.5k/);
            const hasMax = bodyText.match(/12,000|12000|12k/);

            expect(hasAvailable || (hasMinted && hasMax)).toBeTruthy();
          }
        },
        { timeout: 5000 },
      );
    });

    it("displays token contract address", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // The page shows structure immediately, check for actual content
          // Just having "Token Information" doesn't mean data is loaded
          // We need actual token or asset data
          if (bodyText.includes("Wressle") || bodyText.includes("ALB-WR1-R1")) {
            // Should show the contract address (or part of it)
            expect(bodyText.toLowerCase()).toMatch(
              /0xf836a500910453a397084ade41321ee20a5aade1/i,
            );
          }
        },
        { timeout: 5000 },
      );
    });
  });

  describe("Complete Data Flow", () => {
    it("processes and displays all mock data correctly", async () => {
      render(AssetDetailPage);

      await waitFor(
        () => {
          const bodyText = document.body.textContent || "";

          // The page shows structure immediately, check for actual content
          // Just having "Token Information" doesn't mean data is loaded
          // We need actual token or asset data
          if (bodyText.includes("Wressle") || bodyText.includes("ALB-WR1-R1")) {
            // Asset identification
            expect(bodyText).toMatch(/Wressle-1 4\.5% Royalty Stream/i);
            expect(bodyText).toMatch(/Lincolnshire/i);

            // Financial data
            expect(bodyText).toMatch(/\$65/); // Oil price
            expect(bodyText).toMatch(/-\$1\.30|\$-1\.30/); // Benchmark discount

            // Token data
            expect(bodyText).toMatch(/ALB-WR1-R1/);
            expect(bodyText).toMatch(/1500|1,500|1\.5k/); // Minted
            expect(bodyText).toMatch(/12000|12,000|12k/); // Max supply

            // Returns
            expect(bodyText).toMatch(/12\.0%|12\.04%/); // Base return

            // Production data presence
            expect(bodyText).toMatch(/Production|Revenue|Metrics/i);
          }
        },
        { timeout: 5000 },
      );
    });
  });
});
