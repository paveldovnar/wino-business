import { PublicKey } from '@solana/web3.js';
import { USDC_MINT } from './incoming-payment-watcher';

export interface SolanaPayTransferParams {
  recipient: string; // Merchant's public key (base58)
  amount?: number; // Amount in USDC (decimal), omit for custom amount
  reference: string; // Unique reference public key (base58) for this invoice
  label?: string; // Merchant name
  message?: string; // Invoice description
  memo?: string; // Optional memo
}

/**
 * Build a Solana Pay transfer request URI.
 * This is RECEIVE-ONLY: generates a payment request that CUSTOMERS will pay.
 * The merchant never sends funds.
 *
 * Spec: https://docs.solanapay.com/spec#transfer-request
 *
 * Format:
 * solana:<recipient>?amount=<amount>&spl-token=<mint>&reference=<reference>&label=<label>&message=<message>
 *
 * @param params Payment request parameters
 * @returns Solana Pay URI string
 */
export function buildSolanaPayURI(params: SolanaPayTransferParams): string {
  try {
    // Validate recipient
    new PublicKey(params.recipient);

    // Validate reference
    new PublicKey(params.reference);

    // Build base URI
    const url = new URL(`solana:${params.recipient}`);

    // Add SPL token (USDC)
    url.searchParams.set('spl-token', USDC_MINT);

    // Add amount if specified (omit for custom amount)
    if (params.amount !== undefined && params.amount > 0) {
      url.searchParams.set('amount', params.amount.toString());
    }

    // Add reference (REQUIRED for safe matching)
    url.searchParams.set('reference', params.reference);

    // Add label if provided
    if (params.label) {
      url.searchParams.set('label', encodeURIComponent(params.label));
    }

    // Add message if provided
    if (params.message) {
      url.searchParams.set('message', encodeURIComponent(params.message));
    }

    // Add memo if provided
    if (params.memo) {
      url.searchParams.set('memo', encodeURIComponent(params.memo));
    }

    return url.toString();
  } catch (error) {
    console.error('[solana-pay] Error building Solana Pay URI:', error);
    throw new Error('Invalid Solana Pay parameters');
  }
}

/**
 * Parse a Solana Pay URI to extract payment parameters.
 * This is for validation/debugging purposes only.
 *
 * @param uri Solana Pay URI
 * @returns Parsed parameters or null if invalid
 */
export function parseSolanaPayURI(uri: string): SolanaPayTransferParams | null {
  try {
    const url = new URL(uri);

    if (url.protocol !== 'solana:') {
      return null;
    }

    const recipient = url.pathname;
    const amount = url.searchParams.get('amount');
    const reference = url.searchParams.get('reference');
    const label = url.searchParams.get('label');
    const message = url.searchParams.get('message');
    const memo = url.searchParams.get('memo');

    if (!recipient || !reference) {
      return null;
    }

    return {
      recipient,
      amount: amount ? parseFloat(amount) : undefined,
      reference,
      label: label ? decodeURIComponent(label) : undefined,
      message: message ? decodeURIComponent(message) : undefined,
      memo: memo ? decodeURIComponent(memo) : undefined,
    };
  } catch (error) {
    console.error('[solana-pay] Error parsing Solana Pay URI:', error);
    return null;
  }
}

/**
 * Validate that a Solana Pay URI is well-formed.
 *
 * @param uri Solana Pay URI
 * @returns True if valid, false otherwise
 */
export function isValidSolanaPayURI(uri: string): boolean {
  const parsed = parseSolanaPayURI(uri);
  if (!parsed) return false;

  try {
    // Validate recipient is a valid public key
    new PublicKey(parsed.recipient);

    // Validate reference is a valid public key
    new PublicKey(parsed.reference);

    return true;
  } catch {
    return false;
  }
}
