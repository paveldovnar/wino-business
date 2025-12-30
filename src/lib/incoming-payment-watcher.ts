import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { getSolanaConnection } from './solana';

// USDC mainnet mint address
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;

// SPL Token Program ID
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export interface IncomingPayment {
  signature: string;
  from: string;
  to: string;
  amount: number; // in USDC (not lamports)
  timestamp: number;
  mint: string;
  hasReference?: boolean; // Debug: Was reference found in tx?
  walletType?: string; // Debug: Detected wallet type
}

export interface WatchIncomingPaymentsOptions {
  merchantAddress: string;
  expectedAmount?: number; // in USDC, if set will match >= this amount
  reference?: string; // Solana Pay reference public key for safe matching
  invoiceCreatedAt?: Date; // Invoice creation timestamp for fallback matching
  onPaymentDetected: (payment: IncomingPayment) => void;
  onError?: (error: Error) => void;
  timeout?: number; // in milliseconds, default 10 minutes
}

/**
 * Compute the Associated Token Account (ATA) address for a wallet and mint.
 * This is a deterministic address derived from the wallet and mint.
 *
 * @param walletAddress Wallet's public key
 * @param mintAddress Token mint address
 * @returns The ATA address
 */
async function getAssociatedTokenAddress(
  walletAddress: PublicKey,
  mintAddress: PublicKey
): Promise<PublicKey> {
  const [address] = await PublicKey.findProgramAddress(
    [
      walletAddress.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mintAddress.toBuffer(),
    ],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') // Associated Token Program
  );
  return address;
}

/**
 * RECEIVE-ONLY: Watch for incoming USDC payments to merchant address.
 * This function NEVER sends transactions or signs anything.
 *
 * DUAL-WATCHER STRATEGY:
 * - PRIMARY: Poll reference pubkey (for Solana Pay compliant wallets)
 * - FALLBACK: Poll merchant USDC ATA (for Trust Wallet and others)
 *
 * @param options Configuration for watching incoming payments
 * @returns Cleanup function to stop watching
 */
export function watchIncomingUSDCPayments(
  options: WatchIncomingPaymentsOptions
): () => void {
  const connection = getSolanaConnection();
  const merchantPubkey = new PublicKey(options.merchantAddress);

  let isActive = true;
  let pollingInterval: NodeJS.Timeout | null = null;
  let timeoutId: NodeJS.Timeout | null = null;
  let lastCheckedSignatureReference: string | null = null;
  let lastCheckedSignatureATA: string | null = null;
  let merchantUsdcAta: PublicKey | null = null;

  console.log('[incoming-payment-watcher] Starting DUAL-WATCHER for merchant:', options.merchantAddress);
  console.log('[incoming-payment-watcher] Expected amount:', options.expectedAmount, 'USDC');
  console.log('[incoming-payment-watcher] Reference:', options.reference || 'none');
  console.log('[incoming-payment-watcher] Invoice created:', options.invoiceCreatedAt?.toISOString() || 'unknown');

  const cleanup = () => {
    if (!isActive) return;
    isActive = false;

    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    console.log('[incoming-payment-watcher] Stopped watching');
  };

  // Set timeout if specified
  if (options.timeout) {
    timeoutId = setTimeout(() => {
      console.log('[incoming-payment-watcher] Timeout reached');
      cleanup();
    }, options.timeout);
  }

  // Initialize merchant USDC ATA
  (async () => {
    try {
      const usdcMint = new PublicKey(USDC_MINT);
      merchantUsdcAta = await getAssociatedTokenAddress(merchantPubkey, usdcMint);
      console.log('[incoming-payment-watcher] Merchant USDC ATA:', merchantUsdcAta.toBase58());
    } catch (err) {
      console.error('[incoming-payment-watcher] Error computing USDC ATA:', err);
      options.onError?.(err as Error);
    }
  })();

  // Poll for new transactions
  const checkForPayments = async () => {
    if (!isActive) return;

    try {
      let paymentFound = false;

      // PRIMARY WATCHER: Check reference pubkey (if provided)
      if (options.reference && !paymentFound) {
        try {
          const referencePubkey = new PublicKey(options.reference);
          const signatures = await connection.getSignaturesForAddress(
            referencePubkey,
            { limit: 10 },
            'confirmed'
          );

          if (signatures.length > 0) {
            console.log(`[incoming-payment-watcher] PRIMARY: Found ${signatures.length} signatures for reference`);

            const newSignatures = lastCheckedSignatureReference
              ? signatures.slice(
                  0,
                  signatures.findIndex(s => s.signature === lastCheckedSignatureReference)
                )
              : signatures;

            if (signatures.length > 0) {
              lastCheckedSignatureReference = signatures[0].signature;
            }

            for (const sigInfo of newSignatures) {
              if (!isActive || paymentFound) break;

              try {
                const tx = await connection.getParsedTransaction(
                  sigInfo.signature,
                  { maxSupportedTransactionVersion: 0 }
                );

                if (!tx || !tx.meta || tx.meta.err) {
                  continue;
                }

                const payment = parseUSDCTransfer(
                  tx,
                  merchantPubkey,
                  options.reference,
                  options.invoiceCreatedAt
                );

                if (payment && validatePayment(payment, options)) {
                  console.log('[incoming-payment-watcher] PRIMARY: Payment detected via reference!', payment);
                  payment.hasReference = true;
                  payment.walletType = 'Solana Pay compliant (Phantom/Solflare)';
                  options.onPaymentDetected(payment);
                  cleanup();
                  paymentFound = true;
                  break;
                }
              } catch (err) {
                console.error('[incoming-payment-watcher] PRIMARY: Error parsing transaction:', err);
              }
            }
          }
        } catch (err) {
          console.error('[incoming-payment-watcher] PRIMARY: Error checking reference:', err);
        }
      }

      // FALLBACK WATCHER (MANDATORY): Check merchant USDC ATA
      if (!paymentFound && merchantUsdcAta) {
        try {
          const signatures = await connection.getSignaturesForAddress(
            merchantUsdcAta,
            { limit: 10 },
            'confirmed'
          );

          if (signatures.length > 0) {
            console.log(`[incoming-payment-watcher] FALLBACK: Found ${signatures.length} signatures for USDC ATA`);

            const newSignatures = lastCheckedSignatureATA
              ? signatures.slice(
                  0,
                  signatures.findIndex(s => s.signature === lastCheckedSignatureATA)
                )
              : signatures;

            if (signatures.length > 0) {
              lastCheckedSignatureATA = signatures[0].signature;
            }

            for (const sigInfo of newSignatures) {
              if (!isActive || paymentFound) break;

              try {
                const tx = await connection.getParsedTransaction(
                  sigInfo.signature,
                  { maxSupportedTransactionVersion: 0 }
                );

                if (!tx || !tx.meta || tx.meta.err) {
                  continue;
                }

                // Check if transaction is within invoice timeframe
                const txTimestamp = (tx.blockTime || 0) * 1000;
                const invoiceStart = options.invoiceCreatedAt
                  ? options.invoiceCreatedAt.getTime() - 30000 // 30 seconds before invoice creation
                  : 0;

                if (txTimestamp < invoiceStart) {
                  // Transaction too old, skip
                  continue;
                }

                const payment = parseUSDCTransfer(
                  tx,
                  merchantPubkey,
                  undefined, // Don't require reference for fallback
                  options.invoiceCreatedAt
                );

                if (payment && validatePayment(payment, options)) {
                  console.log('[incoming-payment-watcher] FALLBACK: Payment detected via USDC ATA!', payment);
                  payment.hasReference = false;
                  payment.walletType = 'Trust Wallet or non-Solana Pay wallet';
                  options.onPaymentDetected(payment);
                  cleanup();
                  paymentFound = true;
                  break;
                }
              } catch (err) {
                console.error('[incoming-payment-watcher] FALLBACK: Error parsing transaction:', err);
              }
            }
          }
        } catch (err) {
          console.error('[incoming-payment-watcher] FALLBACK: Error checking USDC ATA:', err);
        }
      }
    } catch (err) {
      console.error('[incoming-payment-watcher] Error in polling cycle:', err);
      options.onError?.(err as Error);
    }
  };

  // Start polling every 2 seconds
  pollingInterval = setInterval(checkForPayments, 2000);

  // Do initial check immediately
  checkForPayments();

  return cleanup;
}

/**
 * Validate that a payment meets the invoice requirements.
 *
 * @param payment Detected payment
 * @param options Invoice options
 * @returns True if valid, false otherwise
 */
function validatePayment(
  payment: IncomingPayment,
  options: WatchIncomingPaymentsOptions
): boolean {
  // Check if amount matches (if expected amount is set)
  if (options.expectedAmount !== undefined) {
    if (payment.amount >= options.expectedAmount) {
      console.log('[incoming-payment-watcher] Amount matches!', payment.amount, '>=', options.expectedAmount);
      return true;
    } else {
      console.log(
        `[incoming-payment-watcher] Amount too low: ${payment.amount} < ${options.expectedAmount}`
      );
      return false;
    }
  } else {
    // No expected amount, accept any USDC payment > 0
    if (payment.amount > 0) {
      console.log('[incoming-payment-watcher] Custom amount accepted:', payment.amount);
      return true;
    } else {
      console.log('[incoming-payment-watcher] Amount is zero, rejecting');
      return false;
    }
  }
}

/**
 * Parse a Solana transaction to extract USDC transfer information.
 * RECEIVE-ONLY: Only extracts transfer data, never creates or signs transactions.
 *
 * @param tx Parsed transaction from Solana RPC
 * @param merchantPubkey Merchant's public key to check if they are the recipient
 * @param referencePubkey Optional Solana Pay reference for safe matching
 * @param invoiceCreatedAt Optional invoice creation timestamp for time-based filtering
 * @returns IncomingPayment if USDC was transferred to merchant, null otherwise
 */
function parseUSDCTransfer(
  tx: ParsedTransactionWithMeta,
  merchantPubkey: PublicKey,
  referencePubkey?: string,
  invoiceCreatedAt?: Date
): IncomingPayment | null {
  if (!tx.meta || !tx.transaction) {
    return null;
  }

  const { message } = tx.transaction;
  const accountKeys = message.accountKeys;

  // If reference is provided, check if it's in the transaction's account keys
  // This is how Solana Pay works - the reference is added as an additional account
  if (referencePubkey) {
    const hasReference = accountKeys.some(
      key => key.pubkey.toString() === referencePubkey
    );

    if (!hasReference) {
      // Transaction doesn't contain our reference, skip it
      return null;
    }

    console.log('[incoming-payment-watcher] Reference match found in transaction');
  }

  // Look for SPL token transfer instructions
  for (const instruction of message.instructions) {
    // Check if this is a parsed instruction
    if ('parsed' in instruction) {
      const parsed = instruction.parsed;

      // Check for SPL token transfer
      if (
        parsed.type === 'transfer' ||
        parsed.type === 'transferChecked'
      ) {
        const info = parsed.info;

        // Verify it's a USDC transfer
        if (parsed.type === 'transferChecked' && info.mint !== USDC_MINT) {
          continue;
        }

        // Get the destination token account owner (the actual recipient)
        const destination = info.destination;

        // Find the destination account in accountKeys
        const destAccountIndex = accountKeys.findIndex(
          key => key.pubkey.toString() === destination
        );

        if (destAccountIndex === -1) {
          continue;
        }

        // Get the actual owner of the destination token account
        // For SPL tokens, we need to check the postTokenBalances to find the owner
        const postTokenBalances = tx.meta.postTokenBalances || [];
        const destTokenBalance = postTokenBalances.find(
          balance => balance.accountIndex === destAccountIndex
        );

        if (destTokenBalance && destTokenBalance.owner) {
          const recipientOwner = destTokenBalance.owner;

          // Check if the merchant is the recipient
          if (recipientOwner === merchantPubkey.toBase58()) {
            const amount =
              parsed.type === 'transferChecked'
                ? parseFloat(info.tokenAmount.uiAmountString)
                : parseFloat(info.amount) / Math.pow(10, USDC_DECIMALS);

            const sourceAccount = info.source;
            const sourceTokenBalance = (tx.meta.preTokenBalances || []).find(
              balance =>
                accountKeys[balance.accountIndex]?.pubkey.toString() === sourceAccount
            );

            return {
              signature: tx.transaction.signatures[0],
              from: sourceTokenBalance?.owner || 'unknown',
              to: recipientOwner,
              amount,
              timestamp: (tx.blockTime || 0) * 1000,
              mint: USDC_MINT,
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Get the USDC token account for a wallet address.
 * This is a read-only operation.
 *
 * @param walletAddress The wallet's public key
 * @returns The USDC token account address, or null if not found
 */
export async function getUSDCTokenAccount(
  walletAddress: string
): Promise<string | null> {
  try {
    const connection = getSolanaConnection();
    const walletPubkey = new PublicKey(walletAddress);
    const usdcMint = new PublicKey(USDC_MINT);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: usdcMint }
    );

    if (tokenAccounts.value.length > 0) {
      return tokenAccounts.value[0].pubkey.toBase58();
    }

    return null;
  } catch (err) {
    console.error('[incoming-payment-watcher] Error getting USDC token account:', err);
    return null;
  }
}
