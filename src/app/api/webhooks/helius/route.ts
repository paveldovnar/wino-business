import { NextRequest, NextResponse } from 'next/server';
import {
  getPendingInvoiceByMerchantAta,
  markInvoicePaid,
} from '@/server/storage/invoicesStore';
import { USDC_MINT, USDC_DECIMALS } from '@/server/solana/types';

/**
 * Helius Enhanced Webhook Handler
 * Amount-only invoice matching (NO reference/memo required)
 *
 * RECEIVE-ONLY: Only processes incoming USDC transfers to merchant.
 * Single pending invoice per merchant ATA - matches by amount only.
 */

/**
 * GET handler - Return friendly message for browser access
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    service: 'Wino Business Helius Webhook',
    status: 'ok',
    message: 'Use POST to send webhook events',
  });
}

/**
 * POST handler - Process webhook events
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify webhook authentication
    const authHeader = req.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.HELIUS_WEBHOOK_SECRET}`;

    if (!process.env.HELIUS_WEBHOOK_SECRET) {
      console.error('[webhook] HELIUS_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    if (authHeader !== expectedAuth) {
      console.error('[webhook] Invalid authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse webhook payload
    const payload = await req.json();
    console.log('[webhook] Received webhook event');

    // Enhanced webhooks come as array
    const transactions = Array.isArray(payload) ? payload : [payload];

    console.log(`[webhook] Processing ${transactions.length} transaction(s)`);

    // Process transactions without throwing errors
    for (const txData of transactions) {
      try {
        await processTransaction(txData);
      } catch (err: any) {
        console.error('[webhook] Error processing transaction (non-fatal):', err);
        // Continue processing other transactions
      }
    }

    // Always return 200 OK to Helius
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[webhook] Critical error in webhook handler:', err);
    // Still return 200 to prevent Helius from retrying
    return NextResponse.json({ success: false, error: err.message }, { status: 200 });
  }
}

async function processTransaction(txData: any) {
  try {
    const signature = txData.signature;
    const tokenTransfers = txData.tokenTransfers || [];
    const txTimestamp = txData.timestamp || Math.floor(Date.now() / 1000);

    console.log('[webhook] ================================================');
    console.log('[webhook] Processing transaction:', signature);
    console.log('[webhook] Timestamp:', txTimestamp);

    // Filter USDC transfers only
    const usdcTransfers = tokenTransfers.filter(
      (transfer: any) => transfer.mint === USDC_MINT
    );

    if (usdcTransfers.length === 0) {
      console.log('[webhook] ✗ No USDC transfers found, skipping');
      return;
    }

    console.log(`[webhook] Found ${usdcTransfers.length} USDC transfer(s)`);

    // Process each USDC transfer
    for (const transfer of usdcTransfers) {
      const merchantAta = transfer.toTokenAccount;
      const amountUsd = parseFloat(transfer.tokenAmount);
      const payer = transfer.fromUserAccount;

      console.log('[webhook] Checking USDC transfer:', {
        to: merchantAta,
        amount: amountUsd,
        from: payer,
      });

      // Load THE single pending invoice for this merchant ATA
      const invoice = await getPendingInvoiceByMerchantAta(merchantAta);

      if (!invoice) {
        console.log(`[webhook] ✗ No pending invoice for merchant ATA: ${merchantAta}`);
        continue;
      }

      console.log('[webhook] ✓ Found pending invoice:', {
        id: invoice.id,
        amount: invoice.amountUsd,
        created: invoice.createdAtSec,
        expires: invoice.expiresAtSec,
      });

      // Check if invoice already paid (idempotency)
      if (invoice.status === 'paid') {
        console.log('[webhook] Invoice already marked as paid, skipping');
        continue;
      }

      // Check if invoice is expired
      if (txTimestamp > invoice.expiresAtSec) {
        console.log('[webhook] ⚠️  Invoice expired, skipping');
        console.log('[webhook]   Expires at:', invoice.expiresAtSec);
        console.log('[webhook]   Tx time:', txTimestamp);
        continue;
      }

      // Match by amount (with tolerance for floating point)
      const tolerance = 0.000001;
      const amountDiff = Math.abs(amountUsd - (invoice.amountUsd || 0));

      if (amountDiff > tolerance) {
        console.log('[webhook] ✗ Amount mismatch:', {
          expected: invoice.amountUsd,
          received: amountUsd,
          diff: amountDiff,
        });
        continue;
      }

      // MATCH FOUND!
      console.log('[webhook] ✓✓✓ PAYMENT MATCHED ✓✓✓');
      console.log('[webhook]   Invoice ID:', invoice.id);
      console.log('[webhook]   Amount:', amountUsd, 'USDC');
      console.log('[webhook]   Transaction:', signature);
      console.log('[webhook]   Payer:', payer || 'unknown');

      await markInvoicePaid(invoice.id, signature, payer);

      console.log('[webhook] ✅ Invoice marked as PAID');
      return; // Stop processing after first match
    }

    console.log('[webhook] ✗ No matching invoice found');
  } catch (err: any) {
    console.error('[webhook] Error processing transaction:', err);
    throw err;
  }
}
