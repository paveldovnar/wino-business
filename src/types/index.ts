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
  type: 'invoice'; // Merchant app is RECEIVE-ONLY, all transactions are incoming invoices
}

export interface Invoice {
  id: string;
  amount: number | null;
  allowCustomAmount: boolean;
  recipient: string;
  reference: string; // Solana Pay reference public key (base58) for safe payment matching
  qrCode: string; // Solana Pay URI (solana:...)
  status: 'pending' | 'success' | 'declined';
  signature?: string;
  createdAt: Date;
  expiresAt: Date;
  from?: string; // Payer address when payment is detected
}

export type TransactionStatus = 'pending' | 'success' | 'failed' | 'declined';
