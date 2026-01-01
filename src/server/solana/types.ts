// Solana USDC constants and types for webhook-based payment verification

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;

export interface StoredInvoice {
  id: string;
  merchantWallet: string; // merchant pubkey
  merchantUsdcAta: string;
  amountUsd?: number; // in USDC UI (undefined for custom amount)
  amountMinor?: string; // BigInt as string (base units, 6 decimals for USDC)
  referencePubkey: string; // Solana Pay reference - PRIMARY matching key
  label?: string;
  message?: string;
  status: 'pending' | 'paid' | 'declined';
  createdAtSec: number;
  paidTxSig?: string;
  paidAtSec?: number;
  payer?: string;
}
