export interface Business {
  id: string;
  name: string;
  logo?: string; // Local data URL (temporary, before upload)
  logoUri?: string; // Arweave/Irys URI (ar://... or https://...)
  walletAddress: string;
  // On-chain identity (PDA)
  identityPda?: string; // PDA address on Solana
  identityTxSignature?: string; // Transaction signature for creation
  // Legacy Arweave (deprecated)
  arweaveTxId?: string; // Identity TX on Arweave (deprecated)
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
