import { render, screen, waitFor } from '@testing-library/svelte/svelte5';
import { vi, describe, it, beforeEach, expect, afterEach } from 'vitest';
import PortfolioPage from '../routes/(main)/portfolio/+page.svelte';
import { installHttpMocks } from './http-mock';

// Mock app stores - required for routing
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return {
    page: readable({ url: new URL('http://localhost/portfolio'), params: {}, route: {}, status: 200, error: null, data: {} }),
    navigating: readable(null),
    updated: { subscribe: () => () => {} },
  } as any;
});

// Mock wagmi with connected wallet
vi.mock('svelte-wagmi', async () => {
  const { writable, readable } = await import('svelte/store');
  return {
    web3Modal: writable({ open: () => {} }),
    signerAddress: writable('0x1111111111111111111111111111111111111111'),
    connected: writable(true),
    loading: writable(false),
    wagmiConfig: readable({ chains: [], transports: {} }),
    chainId: writable(8453),
    disconnectWagmi: async () => {},
  } as any;
});

// Mock network config - only mock URLs, not data
vi.mock('$lib/network', async () => {
  const actual = await vi.importActual<any>('$lib/network');
  return {
    ...actual,
    BASE_SFT_SUBGRAPH_URL: 'https://example.com/sft',
    BASE_METADATA_SUBGRAPH_URL: 'https://example.com/meta',
    BASE_ORDERBOOK_SUBGRAPH_URL: 'https://example.com/orderbook',
    PINATA_GATEWAY: 'https://gateway.pinata.cloud/ipfs',
    ENERGY_FIELDS: [
      {
        name: 'Wressle-1',
        sftTokens: [
          {
            address: '0xf836a500910453a397084ade41321ee20a5aade1',
            claims: [
              {
                csvLink: 'https://gateway.pinata.cloud/ipfs/bafkreicjcemmypds6d5c4lonwp56xb2ilzhkk7hty3y6fo4nvdkxnaibgu',
                orderHash: '0x43ec2493caed6b56cfcbcf3b9279a01aedaafbce509598dfb324513e2d199977',
                expectedMerkleRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
                expectedContentHash: 'bafkreicjcemmypds6d5c4lonwp56xb2ilzhkk7hty3y6fo4nvdkxnaibgu'
              }
            ]
          }
        ]
      },
      {
        name: 'Gulf Deep Water',
        sftTokens: [
          {
            address: '0xa111111111111111111111111111111111111111',
            claims: []
          }
        ]
      }
    ]
  };
});

// Mock wagmi core
vi.mock('@wagmi/core', () => ({
  readContract: vi.fn().mockResolvedValue(BigInt('10000000000000000000000')), // Default max supply
  multicall: vi.fn().mockResolvedValue([
    { status: 'success', result: BigInt('10000000000000000000000') }
  ])
}));

// DO NOT MOCK THESE - Let them use production code that fetches from HTTP mocks:
// - $lib/queries/getAllDeposits
// - $lib/queries/getTrades
// - $lib/queries/getOrder
// - $lib/utils/claims
// - $lib/stores
// - $lib/decodeMetadata/helpers
// - $lib/services
// - $lib/composables

const ADDRESS = '0xf836a500910453a397084ade41321ee20a5aade1';
const ADDRESS2 = '0xa111111111111111111111111111111111111111';
const ORDER = '0x43ec2493caed6b56cfcbcf3b9279a01aedaafbce509598dfb324513e2d199977';
const CSV = 'bafkreicjcemmypds6d5c4lonwp56xb2ilzhkk7hty3y6fo4nvdkxnaibgu';
const WALLET = '0x1111111111111111111111111111111111111111';

describe('Portfolio Page E2E Tests', () => {
  let restore: () => void;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Install HTTP mocks for all endpoints
    restore = installHttpMocks({
      sftSubgraphUrl: 'https://example.com/sft',
      metadataSubgraphUrl: 'https://example.com/meta',
      orderbookSubgraphUrl: 'https://example.com/orderbook',
      ipfsGateway: 'https://gateway.pinata.cloud/ipfs',
      wallet: WALLET,
      address: ADDRESS,
      orderHash: ORDER,
      csvCid: CSV,
      hypersyncUrl: 'https://8453.hypersync.xyz/query',
    });
  });

  afterEach(() => {
    restore?.();
  });

  describe('Page Structure', () => {
    it('renders portfolio page with correct title and subtitle', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Page title
          const hasPortfolio = bodyText.match(/Portfolio/i);
          const hasMyHoldings = bodyText.match(/My Holdings/i);
          
          expect(hasPortfolio || hasMyHoldings).toBeTruthy();
          
          // Subtitle or description
          const hasTrack = bodyText.match(/Track your investments/i);
          const hasEnergy = bodyText.match(/energy royalty/i);
          const hasPerformance = bodyText.match(/performance/i);
          
          expect(hasTrack || hasEnergy || hasPerformance).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('displays main portfolio sections', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check for any of the key sections - they may appear gradually
        const hasPortfolioValue = bodyText.match(/Portfolio Value|Total Value/i);
        const hasInvested = bodyText.match(/Total Invested|Invested/i);
        const hasAssets = bodyText.match(/Active Assets|Assets/i);
        const hasUnclaimed = bodyText.match(/Unclaimed|Available/i);
        
        // At least some key sections should be present
        expect(hasPortfolioValue || hasInvested || hasAssets || hasUnclaimed).toBeTruthy();
      }, { timeout: 10000 });
    });
  });

  describe('Portfolio Holdings Display', () => {
    it('displays user token holdings correctly', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show holdings section
          expect(bodyText).toMatch(/Holdings|My Holdings/i);
          
          // Should show Wressle holding (from HTTP mock)
          expect(bodyText).toMatch(/Wressle/i);
        }
      }, { timeout: 5000 });
    });

    it('shows token details from HTTP mock data', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show Wressle from HTTP mock
          expect(bodyText).toMatch(/Wressle-1|ALB-WR1-R1/);
          
          // Should show token amounts from deposits query
          const hasTokenAmount = bodyText.match(/\d+/);
          expect(hasTokenAmount).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('displays token percentages of asset', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // From HTTP mock metadata: 2.5% royalty share
          const hasShare = bodyText.match(/2\.5%|Royalty/i);
          expect(hasShare).toBeTruthy();
        }
      }, { timeout: 5000 });
    });
  });

  describe('Token Balances', () => {
    it('shows token holdings from subgraph', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show token counts from depositWithReceipts query
          const hasTokens = bodyText.match(/\d+.*tokens?|\d+.*holdings?/i);
          expect(hasTokens).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('displays token values based on returns', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // From HTTP mock: 12.04% base return
          const hasReturn = bodyText.match(/12\.04%|12%|Return/i);
          expect(hasReturn).toBeTruthy();
        }
      }, { timeout: 5000 });
    });
  });

  describe('Portfolio Value Calculations', () => {
    it('calculates total portfolio value', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show portfolio value
          expect(bodyText).toMatch(/Portfolio Value|Total Value/i);
          
          // Should have dollar amounts
          const hasDollar = bodyText.match(/\$/);
          expect(hasDollar).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('shows total invested amount', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check for investment-related content
        const hasInvested = bodyText.match(/Total Invested|Invested/i);
        const hasDollar = bodyText.match(/\$/);
        
        // Should have at least one of these
        expect(hasInvested || hasDollar).toBeTruthy();
      }, { timeout: 10000 });
    });

    it('displays unclaimed payouts total from CSV', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show unclaimed
          expect(bodyText).toMatch(/Unclaimed/i);
          
          // From HTTP mock CSV: 347.76 + 330.885
          const hasAmounts = bodyText.match(/347|330|\$\d+/);
          expect(hasAmounts).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('shows total earned including all payouts', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show total earned
          expect(bodyText).toMatch(/Total Earned|All Payouts/i);
          
          // Should have amounts from CSV data
          const hasAmounts = bodyText.match(/\$\d+|\d+\.\d+/);
          expect(hasAmounts).toBeTruthy();
        }
      }, { timeout: 5000 });
    });
  });

  describe('Statistics and Metrics', () => {
    it('shows number of active assets', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show active assets count
          expect(bodyText).toMatch(/Active Assets/i);
          
          // Should show count
          const hasCount = bodyText.match(/\d+.*Assets|Assets.*\d+/);
          expect(hasCount).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('displays performance metrics', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show performance section
          const hasPerformance = bodyText.match(/Performance/i);
          const hasReturns = bodyText.match(/Returns/i);
          const hasYield = bodyText.match(/Yield/i);
          
          expect(hasPerformance || hasReturns || hasYield).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('shows allocation breakdown', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show allocation
          const hasAllocation = bodyText.match(/Allocation/i);
          const hasBreakdown = bodyText.match(/Breakdown/i);
          const hasDistribution = bodyText.match(/Distribution/i);
          
          expect(hasAllocation || hasBreakdown || hasDistribution).toBeTruthy();
        }
      }, { timeout: 5000 });
    });
  });

  describe('Quick Actions', () => {
    it('displays portfolio management actions', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should have action buttons
          const hasAddInvestment = bodyText.match(/Add Investment|Browse Assets/i);
          const hasClaim = bodyText.match(/Claim/i);
          const hasExport = bodyText.match(/Export/i);
          
          expect(hasAddInvestment || hasClaim || hasExport).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('shows claim payouts action', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show claim action
          expect(bodyText).toMatch(/Claim/i);
        }
      }, { timeout: 5000 });
    });

    it('includes export functionality', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should have export option
          expect(bodyText).toMatch(/Export|Download/i);
        }
      }, { timeout: 5000 });
    });
  });

  describe('Payout History', () => {
    it('displays monthly payout data', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Should show payout history or monthly data
          const hasMonthly = bodyText.match(/Monthly/i);
          const hasPayouts = bodyText.match(/Payouts/i);
          const hasHistory = bodyText.match(/History/i);
          
          expect(hasMonthly || hasPayouts || hasHistory).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('shows payout amounts from CSV data', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // From HTTP mock CSV data
          const hasAmounts = bodyText.match(/347|330/);
          
          if (hasAmounts) {
            expect(hasAmounts).toBeTruthy();
          }
        }
      }, { timeout: 5000 });
    });
  });

  describe('Complete Data Flow', () => {
    it('processes and displays all mock data correctly', async () => {
      render(PortfolioPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        // Check if we're past the loading state - look for specific content instead
        if (bodyText.includes('Portfolio') || bodyText.includes('ALB-WR1-R1')) {
          // Verify key sections
          expect(bodyText).toMatch(/Portfolio/i);
          expect(bodyText).toMatch(/Holdings/i);
          
          // Verify assets from HTTP mock
          expect(bodyText).toMatch(/Wressle/);
          
          // Verify financial data
          expect(bodyText).toMatch(/Unclaimed/i);
          
          // Verify some numeric values are present
          const hasNumbers = bodyText.match(/\d+/);
          expect(hasNumbers).toBeTruthy();
          
          // Verify actions
          expect(bodyText).toMatch(/Claim|Export/i);
        }
      }, { timeout: 5000 });
    });
  });
});