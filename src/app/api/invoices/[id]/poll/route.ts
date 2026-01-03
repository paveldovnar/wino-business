import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { getInvoice, markInvoicePaid } from '@/server/storage/invoicesStore';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

/**
 * POST /api/invoices/:id/poll
 * Poll for payment by checking on-chain transactions
 * Matches by amount only (since we're a single POS terminal)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;

    // Get invoice
    const invoice = await getInvoice(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // If already paid, return success
    if (invoice.status === 'paid') {
      return NextResponse.json({
        status: 'paid',
        paidTxSig: invoice.paidTxSig,
        payer: invoice.payer,
      });
    }

    // If expired, return expired status
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > invoice.expiresAtSec) {
      return NextResponse.json({ status: 'expired' });
    }

    // Connect to Solana
    const rpcUrl = process.env.HELIUS_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Get merchant USDC ATA
    const merchantPubkey = new PublicKey(invoice.merchantWallet);
    const merchantUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      merchantPubkey
    );

    // Check if ATA exists
    const accountInfo = await connection.getAccountInfo(merchantUsdcAta);
    if (!accountInfo) {
      return NextResponse.json({ status: 'pending' });
    }

    // Get recent signatures (last 10 transactions)
    const signatures = await connection.getSignaturesForAddress(
      merchantUsdcAta,
      { limit: 10 }
    );

    // Check each transaction for amount match
    for (const sig of signatures) {
      try {
        // Skip if transaction is older than invoice creation - 30s buffer
        const txTime = sig.blockTime || 0;
        if (txTime < invoice.createdAtSec - 30) {
          continue;
        }

        // Parse transaction
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta) continue;

        // Parse token transfers
        const instructions = tx.transaction.message.instructions;

        for (const ix of instructions) {
          if ('parsed' in ix && ix.program === 'spl-token') {
            const parsed = ix.parsed;

            // Look for transfer to our ATA
            if (
              (parsed.type === 'transfer' || parsed.type === 'transferChecked') &&
              parsed.info?.destination === merchantUsdcAta.toBase58()
            ) {
              const amount = parsed.info.amount || parsed.info.tokenAmount?.amount || '0';
              const amountUsdc = parseInt(amount) / 1_000_000;

              // Match by amount (with small tolerance)
              const tolerance = 0.000001;
              const amountDiff = Math.abs(amountUsdc - (invoice.amountUsd || 0));

              if (amountDiff <= tolerance) {
                // FOUND MATCHING PAYMENT!
                const payer = tx.transaction.message.accountKeys[0]?.pubkey.toBase58() || 'unknown';

                console.log('[poll] Found matching payment:', {
                  invoiceId,
                  signature: sig.signature,
                  amount: amountUsdc,
                  payer,
                });

                // Mark invoice as paid
                await markInvoicePaid(invoiceId, sig.signature, payer);

                return NextResponse.json({
                  status: 'paid',
                  paidTxSig: sig.signature,
                  payer,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('[poll] Error parsing transaction:', sig.signature, err);
        // Continue to next transaction
      }
    }

    // No matching transaction found
    return NextResponse.json({ status: 'pending' });

  } catch (err: any) {
    console.error('[poll] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Polling failed' },
      { status: 500 }
    );
  }
}
