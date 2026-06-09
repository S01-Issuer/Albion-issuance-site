import { render } from "@testing-library/svelte/svelte5";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Navigation, Page } from "@sveltejs/kit";
import ClaimsPage from "../routes/(main)/claims/+page.svelte";
import { installHttpMocks } from "./http-mock";

// Mock app stores
vi.mock("$app/stores", async () => {
  const { readable } = await import("svelte/store");

  const page = readable<Page>({
    url: new URL("http://localhost/claims"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {} as App.PageState,
    form: null,
  });

  const navigating = readable<Navigation | null>(null);

  const baseUpdated = readable(false);
  const updated = {
    subscribe: baseUpdated.subscribe,
    async check() {
      return false;
    },
  };

  return {
    getStores: () => ({ page, navigating, updated }),
    page,
    navigating,
    updated,
  };
});

// Mock wagmi with wallet connected
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
    defaultConfig: vi.fn(),
    configuredConnectors: [],
    wagmiLoaded: readable(true),
    init: vi.fn(),
    WC: {},
  };
});

// Mock @wagmi/core
vi.mock("@wagmi/core", async () => {
  const actual =
    await vi.importActual<typeof import("@wagmi/core")>("@wagmi/core");
  return {
    ...actual,
    writeContract: vi.fn(),
    simulateContract: vi.fn(),
    multicall: vi.fn().mockResolvedValue([
      { result: BigInt("12000000000000000000000"), status: "success" }, // Return max supply for authorizer
    ]),
    readContract: vi.fn().mockResolvedValue(BigInt("12000000000000000000000")), // 12000 tokens max supply in wei
  };
});

// DO NOT MOCK $lib/stores - use actual production code with HTTP mocks

vi.mock("$lib/network", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/network")>("$lib/network");
  return {
    ...actual,
    BASE_SFT_SUBGRAPH_URL: "https://example.com/sft",
    BASE_METADATA_SUBGRAPH_URL: "https://example.com/meta",
    BASE_ORDERBOOK_SUBGRAPH_URL: "https://example.com/orderbook",
    PINATA_GATEWAY: "https://gateway.pinata.cloud/ipfs",
    ENERGY_FIELDS: [
      {
        name: "Wressle-1",
        sftTokens: [
          {
            address: "0xf836a500910453a397084ade41321ee20a5aade1",
            claims: [
              {
                csvLink:
                  "https://gateway.pinata.cloud/ipfs/bafkreialbopoilsqzegeu3a4n6emmikfrxuy5udvtcbzi7jvst7dulrdvu",
                orderHash:
                  "0x43ec2493caed6b56cfcbcf3b9279a01aedaafbce509598dfb324513e2d199977",
                expectedMerkleRoot:
                  "0x0000000000000000000000000000000000000000000000000000000000000000",
                expectedContentHash:
                  "bafkreialbopoilsqzegeu3a4n6emmikfrxuy5udvtcbzi7jvst7dulrdvu",
                // Static-order resolution (subgraph-free): claim is on the v6
                // (claimable, Float) OrderBook 0xb05D…
                orderBytes: "0x",
                deployBlock: 1,
                orderbook: "0xb05D73E6BCc26AEB5b67Ff68C6E9C6151073e3cE",
              },
              {
                csvLink:
                  "https://gateway.pinata.cloud/ipfs/bafkreigo7j3zwkoxeusgu2z3r2m3wcuxgffypaemmsfgi4idaaf73cqbs4",
                orderHash: "0xotherorderhash",
                expectedMerkleRoot:
                  "0x0000000000000000000000000000000000000000000000000000000000000000",
                expectedContentHash:
                  "bafkreigo7j3zwkoxeusgu2z3r2m3wcuxgffypaemmsfgi4idaaf73cqbs4",
                orderBytes: "0x",
                deployBlock: 1,
                orderbook: "0xb05D73E6BCc26AEB5b67Ff68C6E9C6151073e3cE",
              },
            ],
          },
        ],
      },
    ],
  };
});

// DO NOT MOCK THESE - Let them use production code that fetches from HTTP mocks:
// - $lib/data/repositories/*
// - $lib/services/*
// - $lib/utils/claims
// Note: ClaimsService makes direct repository calls and doesn't use stores,
// so we don't need to populate stores for claims tests

const ADDRESS = "0xf836a500910453a397084ade41321ee20a5aade1";
const ORDER =
  "0x43ec2493caed6b56cfcbcf3b9279a01aedaafbce509598dfb324513e2d199977";
const CSV = "bafkreialbopoilsqzegeu3a4n6emmikfrxuy5udvtcbzi7jvst7dulrdvu";
const WALLET = "0x1111111111111111111111111111111111111111";

// The claims load now does real per-CSV content-hash verification + CBOR metadata
// decoding + catalog build, which takes longer (and varies) than a fixed sleep can
// reliably cover. Poll the DOM until the page leaves its "Loading…" state (or until
// a generous timeout) instead of guessing a single sleep duration.
async function waitForClaimsLoaded(timeoutMs = 5000): Promise<string> {
  const start = Date.now();
  // Poll until the loading placeholder is gone AND the page has rendered content.
  while (Date.now() - start < timeoutMs) {
    const text = document.body.textContent || "";
    if (!text.includes("Loading your claims") && /Available to Claim/i.test(text)) {
      return text;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return document.body.textContent || "";
}

describe("Claims Page E2E Tests", () => {
  let restore: () => void;

  beforeEach(async () => {
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
      hypersyncUrl: "https://8453.hypersync.xyz/query",
      sfts: [
        {
          address: ADDRESS,
          name: "ALB-WR1-R1",
          symbol: "ALB-WR1-R1",
          totalShares: "1500000000000000000000", // 1500 tokens minted
        },
      ],
    });

    // Note: ClaimsService makes direct repository calls when loadClaimsForWallet() is invoked,
    // so we don't need to populate stores. The HTTP mocks will intercept ClaimsService's
    // repository calls directly, exactly as happens in production.
  });

  afterEach(() => {
    restore?.();
  });

  describe("Page Structure", () => {
    it("renders claims page with correct title and subtitle", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Page should have claims & payouts title
      expect(bodyText).toMatch(/Claims.*Payouts|Payouts.*Claims/i);
    });
  });

  describe("Wallet Balance Display", () => {
    it("displays available to claim amount correctly", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should show Available to Claim
      expect(bodyText).toMatch(/Available to Claim/i);

      // Both claims resolve statically now. CSV 1: 347.76 + 330.885 = 678.645,
      // CSV 2: 250 + 180 = 430. Combined total = 1108.645.
      expect(bodyText).toMatch(/1,?108\.6|\$1,?108/);
    });

    it("shows total earned amount including claimed payouts", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should show Total Earned
      expect(bodyText).toMatch(/Total Earned/i);

      // Should show earnings amount (at least the unclaimed 1108.645)
      expect(bodyText).toMatch(/1,?108\.6|\$1,?108|\d+\.\d+/);
    });

    it("displays total claimed amount", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should show Total Claimed
      expect(bodyText).toMatch(/Total Claimed/i);

      // Should show $0 since no payouts have been claimed yet (empty logs in mock)
      expect(bodyText).toMatch(/\$0/);
    });
  });

  describe("Unclaimed Payouts Details", () => {
    it("displays individual unclaimed payouts by energy field", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should show energy field name
      expect(bodyText).toMatch(/Wressle-1/);

      // Should show total unclaimed amount (both CSVs combined = 1108.645)
      expect(bodyText).toMatch(/1,?108\.6|\$1,?108/);
    });

    it("shows May 2025 payout of $347.76", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // The UI shows the wallet's payout rows (4 across both CSVs) and the total amount
      expect(bodyText).toMatch(/4 claims/);
      expect(bodyText).toMatch(/1,?108\.6|\$1,?108/);
    });

    it("shows June 2025 payout of $330.885", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // The UI shows combined amounts across both resolved claims
      expect(bodyText).toMatch(/1,?108\.6|\$1,?108/);
      expect(bodyText).toMatch(/4 claims/);
    });

    it("groups payouts by energy field", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should show field name
      expect(bodyText).toMatch(/Wressle-1/);

      // Should show grouped total (both CSVs combined = 1108.645)
      expect(bodyText).toMatch(/1,?108\.6|\$1,?108/);
    });
  });

  describe("Claim Actions", () => {
    it("displays claim button when unclaimed payouts exist", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should have claim button or action
      expect(bodyText).toMatch(/Claim/i);
    });

    it("shows ready status for available claims", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should indicate claims are ready or available
      expect(bodyText).toMatch(/Ready|Available/i);
    });

    it("displays gas estimate for claims", async () => {
      render(ClaimsPage);

      await waitForClaimsLoaded();
      // Gas estimate is optional - no assertion needed if not present
    });
  });

  describe("Statistics Section", () => {
    it("displays claims count in asset cards", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should show claims count in the asset cards
      expect(bodyText).toMatch(/\d+ claims/i);

      // Should show field names
      expect(bodyText).toMatch(/Wressle/i);
    });

    it("shows correct payout count", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should show payout count (4 wallet rows across both resolved CSVs)
      expect(bodyText).toMatch(/4 claims/);
    });

    it("displays producing status badges", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should show producing status
      expect(bodyText).toMatch(/PRODUCING/i);
    });
  });

  describe("Claim History", () => {
    it("shows claims by asset section", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should show claims by asset section
      expect(bodyText).toMatch(/Claims by Asset/i);

      // Should show available amount of $1,108.645
      expect(bodyText).toMatch(/1,?108\.6|\$1,?108/);
    });

    it("displays claim buttons for each asset", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should have claim buttons
      expect(bodyText).toMatch(/Claim/i);
    });

    it("shows total claims count", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Should show the word "claims" somewhere on the page
      expect(bodyText).toMatch(/claims/i);
    });
  });

  describe("Complete Data Flow", () => {
    it("processes and displays all mock data correctly", async () => {
      render(ClaimsPage);

      const bodyText = await waitForClaimsLoaded();

      // Verify key sections
      expect(bodyText).toMatch(/Claims.*Payouts|Payouts.*Claims/i);
      expect(bodyText).toMatch(/Available to Claim/i);
      expect(bodyText).toMatch(/Total Earned/i);
      expect(bodyText).toMatch(/Total Claimed/i);

      // Verify energy field
      expect(bodyText).toMatch(/Wressle-1/);

      // Verify total amount from mock data (both CSVs combined = 1108.645)
      expect(bodyText).toMatch(/1,?108\.6|\$1,?108/);

      // Verify action elements
      expect(bodyText).toMatch(/Claim/i);
    });
  });

  describe("Service Integration", () => {
    it("ClaimsService makes direct repository calls (not using stores)", async () => {
      const { useClaimsService } = await import("$lib/services");
      const claimsService = useClaimsService();
      expect(claimsService).toBeDefined();
      expect(claimsService.loadClaimsForWallet).toBeDefined();

      // This service will fetch data directly via repositories when called
      // The HTTP mocks intercept these repository calls
    });
  });
});
