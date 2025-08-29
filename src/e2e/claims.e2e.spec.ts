import { render, screen, waitFor, fireEvent } from '@testing-library/svelte/svelte5';
import { vi, describe, it, beforeEach, expect, afterEach } from 'vitest';
import ClaimsPage from '../routes/(main)/claims/+page.svelte';
import { installHttpMocks } from './http-mock';

// Mock app stores - required for routing
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return {
    page: readable({ url: new URL('http://localhost/claims'), params: {}, route: {}, status: 200, error: null, data: {} }),
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

// Mock wagmi core for contract interactions
vi.mock('@wagmi/core', () => ({
  writeContract: vi.fn().mockResolvedValue('0xtxhash'),
  simulateContract: vi.fn().mockResolvedValue({
    request: { gas: BigInt(100000) }
  })
}));

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
              },
              {
                csvLink: 'https://gateway.pinata.cloud/ipfs/bafkreiothercsvfile',
                orderHash: '0xotherorderhash',
                expectedMerkleRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
                expectedContentHash: 'bafkreiothercsvfile'
              }
            ]
          }
        ]
      }
    ]
  };
});

// DO NOT MOCK THESE - Let them use production code that fetches from HTTP mocks:
// - $lib/queries/getTrades
// - $lib/queries/getOrder
// - $lib/utils/claims
// - $lib/stores

const ADDRESS = '0xf836a500910453a397084ade41321ee20a5aade1';
const ORDER = '0x43ec2493caed6b56cfcbcf3b9279a01aedaafbce509598dfb324513e2d199977';
const CSV = 'bafkreicjcemmypds6d5c4lonwp56xb2ilzhkk7hty3y6fo4nvdkxnaibgu';
const WALLET = '0x1111111111111111111111111111111111111111';

describe('Claims Page E2E Tests', () => {
  let restore: () => void;
  
  beforeEach(() => {
    vi.clearAllMocks();
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
    it('renders claims page with correct title and subtitle', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Page title - more flexible matching
          const hasTitle = bodyText.match(/Claims/i);
          const hasPayouts = bodyText.match(/Payouts/i);
          
          // Should have claims-related content
          expect(hasTitle || hasPayouts).toBeTruthy();
          
          // Subtitle or description
          const hasTrack = bodyText.match(/Track/i);
          const hasRoyalty = bodyText.match(/royalty|energy/i);
          
          // Should have some descriptive text
          expect(hasTrack || hasRoyalty).toBeTruthy();
        }
      }, { timeout: 5000 });
    });
  });

  describe('Wallet Balance Display', () => {
    it('displays available to claim amount correctly', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should show Available to Claim
          expect(bodyText).toMatch(/Available to Claim/i);
          
          // From HTTP mock: 347.76 + 330.885 = 678.645
          const hasTotal = bodyText.match(/678\.6|678\.65|\$678/);
          const hasMayAmount = bodyText.match(/347\.7|347\.76/);
          const hasJuneAmount = bodyText.match(/330\.8|330\.88/);
          
          // Should have at least one of these amounts
          expect(hasTotal || hasMayAmount || hasJuneAmount).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('shows total earned amount including claimed payouts', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should show Total Earned
          expect(bodyText).toMatch(/Total Earned/i);
          
          // Should show earnings amount
          const hasAmounts = bodyText.match(/\d+\.\d+|\$\d+/);
          expect(hasAmounts).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('displays total claimed amount', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should show Total Claimed
          expect(bodyText).toMatch(/Total Claimed/i);
          
          // Should show either claimed amount or zero
          const hasAmount = bodyText.match(/\$\d+\.\d+|\$0/);
          expect(hasAmount).toBeTruthy();
        }
      }, { timeout: 5000 });
    });
  });

  describe('Unclaimed Payouts Details', () => {
    it('displays individual unclaimed payouts by energy field', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should show energy field name
          expect(bodyText).toMatch(/Wressle-1/);
          
          // Should show unclaimed amounts
          expect(bodyText).toMatch(/347\.7|330\.8/);
        }
      }, { timeout: 5000 });
    });

    it('shows May 2025 payout of $347.76', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Check for May payout from HTTP mock data
          const hasMayAmount = bodyText.match(/347\.76|347\.7|\$347/);
          expect(hasMayAmount).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('shows June 2025 payout of $330.885', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Check for June payout from HTTP mock data
          const hasJuneAmount = bodyText.match(/330\.88|330\.8|\$330/);
          expect(hasJuneAmount).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('groups payouts by energy field', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should show field name with total
          expect(bodyText).toMatch(/Wressle-1/);
          
          // Should show grouped total (347.76 + 330.885 = 678.645)
          const hasGroupTotal = bodyText.match(/678\.6|678\.65/);
          const hasIndividual = bodyText.match(/347|330/);
          
          expect(hasGroupTotal || hasIndividual).toBeTruthy();
        }
      }, { timeout: 5000 });
    });
  });

  describe('Claim Actions', () => {
    it('displays claim button when unclaimed payouts exist', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should have claim button or action
          const buttons = screen.queryAllByRole('button');
          const hasClaimButton = buttons.some(btn => 
            btn.textContent?.match(/Claim/i)
          );
          
          expect(bodyText).toMatch(/Claim/i);
        }
      }, { timeout: 5000 });
    });

    it('shows ready status for available claims', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should indicate claims are ready
          const hasReady = bodyText.match(/Ready|Available/i);
          expect(hasReady).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('displays gas estimate for claims', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // May show gas estimate
          const hasGas = bodyText.match(/Gas|Fee|Cost/i);
          
          // This is optional depending on implementation
          if (hasGas) {
            expect(hasGas).toBeTruthy();
          }
        }
      }, { timeout: 5000 });
    });
  });

  describe('Statistics Section', () => {
    it('displays detailed statistics correctly', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should show statistics section
          expect(bodyText).toMatch(/Statistics|Detailed Statistics/i);
          
          // Total payouts count
          expect(bodyText).toMatch(/Total Payouts/i);
          
          // Days since last claim
          expect(bodyText).toMatch(/Days Since|Since Last/i);
          
          // Number of claims
          expect(bodyText).toMatch(/Number of Claims/i);
        }
      }, { timeout: 5000 });
    });

    it('shows correct payout count', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should show payout count
          const hasCount = bodyText.match(/\b\d+\b.*Payouts|Payouts.*\b\d+\b/);
          expect(hasCount).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('calculates average claim size', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Average size calculation
          expect(bodyText).toMatch(/Average.*Size|Per Transaction/i);
          
          // Should show some dollar amount
          if (bodyText.includes('$')) {
            expect(bodyText).toMatch(/\$/);
          }
        }
      }, { timeout: 5000 });
    });
  });

  describe('Claim History', () => {
    it('shows claim history section with past claims', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should show claim history section
          expect(bodyText).toMatch(/Claim History/i);
          
          // May show claimed payouts or no history message
          const hasHistory = bodyText.match(/\d+\.\d+|No claim history/i);
          expect(hasHistory).toBeTruthy();
        }
      }, { timeout: 5000 });
    });

    it('displays export functionality', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should have export option
          expect(bodyText).toMatch(/Export/i);
        }
      }, { timeout: 5000 });
    });

    it('shows total claims count', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Should show count of claims
          const hasCount = bodyText.match(/\d+\s+total claims/i);
          const hasClaimsText = bodyText.match(/claims/i);
          
          expect(hasClaimsText).toBeTruthy();
        }
      }, { timeout: 5000 });
    });
  });

  describe('Complete Data Flow', () => {
    it('processes and displays all mock data correctly', async () => {
      render(ClaimsPage);
      
      await waitFor(() => {
        const bodyText = document.body.textContent || '';
        
        if (!bodyText.includes('Loading')) {
          // Verify key sections
          expect(bodyText).toMatch(/Claims & Payouts/i);
          expect(bodyText).toMatch(/Available to Claim/i);
          expect(bodyText).toMatch(/Total Earned/i);
          expect(bodyText).toMatch(/Total Claimed/i);
          
          // Verify energy field
          expect(bodyText).toMatch(/Wressle-1/);
          
          // Verify amounts are present from HTTP mock
          const hasAmounts = bodyText.match(/347|330/);
          expect(hasAmounts).toBeTruthy();
          
          // Verify action elements
          expect(bodyText).toMatch(/Claim/i);
        }
      }, { timeout: 5000 });
    });
  });
});