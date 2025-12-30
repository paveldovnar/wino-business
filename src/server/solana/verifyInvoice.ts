import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;

export interface StoredInvoice {
  id: string;
  createdAtSec: number;
  expiresAtSec: number;
  recipient: string; // merchant pubkey
  merchantUsdcAta: string;
  reference?: string;
  expectedAmount?: number; // in USDC UI
  status: 'pending' | 'paid' | 'expired';
  signature?: string;
  payer?: string;
}

export interface VerifyResult {
  paid: boolean;
  signature?: string;
  payer?: string;
  matchedAmount?: number;
  debug?: {
    checkedAt: number;
    lastSignatureChecked?: string;
    transfersFoundCount: number;
    txsChecked: number;
    rejectReasons: Record<string, number>;
    invoiceCreatedAtSec: number;
  };
}

/**
 * Verify if an invoice has been paid on-chain.
 * Scans merchant's USDC ATA for incoming transfers.
 * RECEIVE-ONLY: Only reads blockchain data.
 */
export async function verifyInvoicePayment(
  invoice: StoredInvoice,
  isDev: boolean = false
): Promise<VerifyResult> {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });

  const debug: VerifyResult['debug'] = {
    checkedAt: Math.floor(Date.now() / 1000),
    transfersFoundCount: 0,
    txsChecked: 0,
    rejectReasons: {},
    invoiceCreatedAtSec: invoice.createdAtSec,
  };

  try {
    const merchantUsdcAta = new PublicKey(invoice.merchantUsdcAta);

    // Get recent signatures for merchant's USDC ATA
    const signatures = await connection.getSignaturesForAddress(
      merchantUsdcAta,
      { limit: 25 },
      'confirmed'
    );

    console.log(`[verifyInvoice] Checking ${signatures.length} signatures for invoice ${invoice.id}`);
    debug.txsChecked = signatures.length;

    if (signatures.length > 0) {
      debug.lastSignatureChecked = signatures[0].signature;
    }

    // Filter signatures by time (must be >= invoice creation - 30s)
    const invoiceStartSec = invoice.createdAtSec - 30;
    const relevantSignatures = signatures.filter(sig => {
      const blockTimeSec = sig.blockTime || 0;
      if (blockTimeSec === 0) return true; // Include if blockTime is null
      return blockTimeSec >= invoiceStartSec;
    });

    console.log(`[verifyInvoice] ${relevantSignatures.length} signatures in time range`);

    // Check each transaction
    for (const sigInfo of relevantSignatures) {
      try {
        const tx = await connection.getParsedTransaction(
          sigInfo.signature,
          { maxSupportedTransactionVersion: 0 }
        );

        if (!tx || !tx.meta || tx.meta.err) {
          debug.rejectReasons['tx_failed_or_null'] = (debug.rejectReasons['tx_failed_or_null'] || 0) + 1;
          continue;
        }

        // Parse transaction for USDC transfers
        const payment = parseUSDCTransfer(tx, merchantUsdcAta, invoice.reference);

        if (!payment) {
          debug.rejectReasons['no_matching_transfer'] = (debug.rejectReasons['no_matching_transfer'] || 0) + 1;
          continue;
        }

        debug.transfersFoundCount++;

        // Validate amount
        if (invoice.expectedAmount !== undefined) {
          const expectedBaseUnits = BigInt(Math.round(invoice.expectedAmount * Math.pow(10, USDC_DECIMALS)));
          const paymentBaseUnits = BigInt(Math.round(payment.amount * Math.pow(10, USDC_DECIMALS)));

          if (paymentBaseUnits < expectedBaseUnits) {
            console.log(`[verifyInvoice] Amount too low: ${payment.amount} < ${invoice.expectedAmount}`);
            debug.rejectReasons['amount_too_low'] = (debug.rejectReasons['amount_too_low'] || 0) + 1;
            continue;
          }
        } else {
          // Custom amount - just check > 0
          if (payment.amount <= 0) {
            debug.rejectReasons['amount_zero'] = (debug.rejectReasons['amount_zero'] || 0) + 1;
            continue;
          }
        }

        // Payment found!
        console.log(`[verifyInvoice] ✓ Payment found for invoice ${invoice.id}: ${payment.amount} USDC from ${payment.payer}`);
        return {
          paid: true,
          signature: payment.signature,
          payer: payment.payer,
          matchedAmount: payment.amount,
          debug: isDev ? debug : undefined,
        };
      } catch (err) {
        console.error(`[verifyInvoice] Error parsing tx ${sigInfo.signature}:`, err);
        debug.rejectReasons['parse_error'] = (debug.rejectReasons['parse_error'] || 0) + 1;
      }
    }

    console.log(`[verifyInvoice] No payment found for invoice ${invoice.id}`);
    return {
      paid: false,
      debug: isDev ? debug : undefined,
    };
  } catch (err) {
    console.error('[verifyInvoice] RPC error:', err);
    throw new Error('Failed to verify payment on-chain');
  }
}

interface ParsedPayment {
  signature: string;
  payer: string;
  amount: number;
}

/**
 * Parse a transaction to find USDC transfer to merchant ATA.
 * Scans ALL instructions including inner instructions.
 */
function parseUSDCTransfer(
  tx: ParsedTransactionWithMeta,
  merchantUsdcAta: PublicKey,
  reference?: string
): ParsedPayment | null {
  if (!tx.meta || !tx.transaction) return null;

  const { message } = tx.transaction;
  const accountKeys = message.accountKeys;

  // If reference provided, check it's in tx
  if (reference) {
    const hasReference = accountKeys.some(key => key.pubkey.toString() === reference);
    if (!hasReference) {
      return null;
    }
  }

  // Collect all parsed instructions (main + inner)
  const allInstructions: any[] = [];

  for (const instruction of message.instructions) {
    if ('parsed' in instruction) {
      allInstructions.push(instruction.parsed);
    }
  }

  if (tx.meta.innerInstructions) {
    for (const innerGroup of tx.meta.innerInstructions) {
      for (const instruction of innerGroup.instructions) {
        if ('parsed' in instruction) {
          allInstructions.push(instruction.parsed);
        }
      }
    }
  }

  // Find USDC transfer to merchant ATA
  for (const parsed of allInstructions) {
    if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
      const info = parsed.info;

      // Check mint for transferChecked
      if (parsed.type === 'transferChecked' && info.mint !== USDC_MINT) {
        continue;
      }

      // Check destination
      if (info.destination !== merchantUsdcAta.toBase58()) {
        continue;
      }

      // Extract amount
      const amount =
        parsed.type === 'transferChecked'
          ? parseFloat(info.tokenAmount.uiAmountString)
          : parseFloat(info.amount) / Math.pow(10, USDC_DECIMALS);

      // Get payer from source token account owner
      const sourceAccount = info.source;
      const sourceTokenBalance = (tx.meta.preTokenBalances || []).find(
        balance => accountKeys[balance.accountIndex]?.pubkey.toString() === sourceAccount
      );

      return {
        signature: tx.transaction.signatures[0],
        payer: sourceTokenBalance?.owner || 'unknown',
        amount,
      };
    }
  }

  return null;
}
