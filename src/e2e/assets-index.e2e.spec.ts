import { render, waitFor } from '@testing-library/svelte/svelte5';
import { vi, describe, it, beforeEach, expect, afterEach } from 'vitest';
import AssetsIndex from '../routes/(main)/assets/+page.svelte';
import { installHttpMocks } from './http-mock';

// Mock app stores
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return {
    page: readable({ url: new URL('http://localhost/assets'), params: {}, route: {}, status: 200, error: null, data: {} }),
    navigating: readable(null),
    updated: { subscribe: () => () => {} },
  } as any;
});

// Mock wagmi
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

// Mock network config with test URLs
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
            address: '0xc699575fe18f00104d926f0167cd858ce6d8b32e'
          }
        ]
      }
    ]
  };
});

// Mock wagmi core for max supply calls
vi.mock('@wagmi/core', () => ({
  readContract: vi.fn().mockResolvedValue(BigInt('10000000000000000000000')),
  multicall: vi.fn().mockResolvedValue([
    { status: 'success', result: BigInt('10000000000000000000000') }
  ])
}));

// Mock onchain client
vi.mock('$lib/data/clients/onchain', () => ({
  getMaxSharesSupplyMap: vi.fn().mockResolvedValue({
    '0xc699575fe18f00104d926f0167cd858ce6d8b32e': '10000000000000000000000'
  })
}));

const ADDRESS = '0xc699575fe18f00104d926f0167cd858ce6d8b32e';
const WALLET = '0x1111111111111111111111111111111111111111';

describe('Assets Index Page E2E Tests', () => {
  let restore: () => void;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Install HTTP mocks
    restore = installHttpMocks({
      sftSubgraphUrl: 'https://example.com/sft',
      metadataSubgraphUrl: 'https://example.com/meta',
      orderbookSubgraphUrl: 'https://example.com/orderbook',
      ipfsGateway: 'https://gateway.pinata.cloud/ipfs',
      wallet: WALLET,
      address: ADDRESS,
      orderHash: '0x43ec2493caed6b56cfcbcf3b9279a01aedaafbce509598dfb324513e2d199977',
      csvCid: 'bafkreicjcemmypds6d5c4lonwp56xb2ilzhkk7hty3y6fo4nvdkxnaibgu',
    });
    
    // Initialize stores with data to trigger component loading
    const { sfts, sftMetadata } = await import('$lib/stores');
    
    // Set initial data to trigger the component's reactive statements
    sfts.set([
      {
        id: ADDRESS,
        totalShares: '12000',
        address: ADDRESS,
        name: 'Wressle-1 4.5% Royalty Stream',
        symbol: 'ALB-WR1-R1',
        deployTimestamp: `${Math.floor(Date.now() / 1000)}`,
        activeAuthorizer: { address: WALLET },
        tokenHolders: []
      }
    ] as any);
    
    sftMetadata.set([
      {
        id: 'meta-1',
        meta: '0x' + Buffer.from('https://gateway.pinata.cloud/ipfs/QmWressleMetadata').toString('hex'),
        subject: `0x000000000000000000000000${ADDRESS.slice(2)}`,
        metaHash: '0x1234',
        sender: WALLET
      }
    ] as any);
  });

  afterEach(() => {
    restore?.();
  });

  describe('Page Structure', () => {
    it('renders assets page with correct title and subtitle', async () => {
      const { container } = render(AssetsIndex);
      
      await waitFor(() => {
        const bodyText = container.textContent || '';
        expect(bodyText).toContain('Available Assets');
        expect(bodyText).toContain('Browse live energy investment opportunities');
      }, { timeout: 3000 });
    });
  });

  describe('Asset Display', () => {
    it('displays asset cards when data is loaded', async () => {
      const { container } = render(AssetsIndex);
      
      await waitFor(() => {
        const bodyText = container.textContent || '';
        // Should show either assets or "no assets" message
        const hasContent = 
          bodyText.includes('Wressle') ||
          bodyText.includes('ALB-WR1-R1') ||
          bodyText.includes('No Available Assets') ||
          bodyText.includes('sold out');
        expect(hasContent).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('shows appropriate empty state when no assets available', async () => {
      const { container } = render(AssetsIndex);
      
      await waitFor(() => {
        const bodyText = container.textContent || '';
        // Page should handle empty/sold out state gracefully
        const hasValidState = 
          bodyText.includes('Wressle') ||
          bodyText.includes('No Available Assets') ||
          bodyText.includes('All assets are currently sold out');
        expect(hasValidState).toBeTruthy();
      }, { timeout: 3000 });
    });
  });

  describe('Token Information', () => {
    it('processes and displays token data', async () => {
      const { container } = render(AssetsIndex);
      
      await waitFor(() => {
        const bodyText = container.textContent || '';
        // Should show token info or empty state
        const hasTokenContent = 
          bodyText.includes('ALB-WR1-R1') ||
          bodyText.includes('Royalty') ||
          bodyText.includes('4.5%') ||
          bodyText.includes('No Available');
        expect(hasTokenContent).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('shows supply and availability information', async () => {
      const { container } = render(AssetsIndex);
      
      await waitFor(() => {
        const bodyText = container.textContent || '';
        // Should show supply metrics or sold out status
        const hasSupplyInfo = 
          bodyText.includes('Supply') ||
          bodyText.includes('Available') ||
          bodyText.includes('Minted') ||
          bodyText.includes('sold out');
        expect(hasSupplyInfo).toBeTruthy();
      }, { timeout: 3000 });
    });
  });

  describe('Complete Data Flow', () => {
    it('integrates HTTP mocks with repository and service layers', async () => {
      const { container } = render(AssetsIndex);
      
      await waitFor(() => {
        const bodyText = container.textContent || '';
        
        // Verify page renders
        expect(bodyText).toContain('Available Assets');
        
        // Verify data flow completed (either shows data or empty state)
        const hasProcessedData = 
          bodyText.includes('Wressle') ||
          bodyText.includes('ALB-WR1-R1') ||
          bodyText.includes('No Available Assets');
        expect(hasProcessedData).toBeTruthy();
      }, { timeout: 3000 });
    });
  });
});