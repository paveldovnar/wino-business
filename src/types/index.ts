export interface Business {
  id: string;
  name: string;
  logo?: string;
  walletAddress: string;
  nftMintAddress?: string;
  createdAt: Date;
}

export interface Transaction {
  id: string;
  signature: string;
  amount: number;
  from: string;
  to: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: Date;
  type: 'invoice' | 'payment';
}

export interface Invoice {
  id: string;
  amount: number | null;
  allowCustomAmount: boolean;
  recipient: string;
  qrCode: string;
  status: 'pending' | 'success' | 'declined';
  signature?: string;
  createdAt: Date;
  from?: string;
}

export type TransactionStatus = 'pending' | 'success' | 'failed' | 'declined';
