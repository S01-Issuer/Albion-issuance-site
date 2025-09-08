/**
 * GraphQL response type definitions
 */

// Base types
export interface Transaction {
  id: string;
  blockNumber: string;
  timestamp: string;
}

export interface TradeEvent {
  sender: string;
  transaction: Transaction;
}

export interface Order {
  orderBytes: string;
  orderHash: string;
}

export interface OrderBook {
  id: string;
}

export interface Trade {
  order: Order;
  orderbook: OrderBook;
  tradeEvent: TradeEvent;
}

export interface TokenHolder {
  address: string;
  balance: string;
}

export interface Authorizer {
  address: string;
}

export interface OffchainAssetReceiptVault {
  id: string;
  address: string;
  name: string;
  symbol: string;
  totalShares: string;
  deployTimestamp: string;
  activeAuthorizer?: Authorizer;
  tokenHolders: TokenHolder[];
  receiptVaultInformations?: Array<{
    timestamp: string;
    information: string;
    id: string;
    caller?: {
      address: string;
    };
    transaction?: {
      blockNumber: string;
    };
  }>;
}

export interface DepositWithReceipt {
  id: string;
  amount: string;
  caller: {
    address: string;
  };
  offchainAssetReceiptVault: {
    id: string;
  };
}

export interface MetaV1S {
  id: string;
  meta: string;
  sender: string;
  subject: string;
  metaHash: string;
}

// Query response types
export interface GetTradesResponse {
  trades: Trade[];
}

export interface GetOrdersResponse {
  orders: Array<Order & { orderbook: OrderBook }>;
}

export interface GetSftsResponse {
  offchainAssetReceiptVaults: OffchainAssetReceiptVault[];
}

export interface GetDepositsResponse {
  depositWithReceipts: DepositWithReceipt[];
}

export interface GetMetadataResponse {
  metaV1S: MetaV1S[];
}