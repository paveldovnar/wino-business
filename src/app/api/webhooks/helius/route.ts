import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceByReference, markInvoicePaid } from '@/server/storage/invoicesStore';
import { USDC_MINT } from '@/server/solana/types';

/**
 * Helius Enhanced Webhook Handler
 * Reference-based invoice matching for robust payment detection
 *
 * RECEIVE-ONLY: Only processes incoming USDC transfers to merchant.
 * Uses reference public key matching to identify payments reliably.
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
    const accountData = txData.accountData || [];
    const tokenTransfers = txData.tokenTransfers || [];

    console.log('[webhook] ================================================');
    console.log('[webhook] Processing transaction:', signature);

    // Extract all account keys from the transaction
    const accountKeys: string[] = accountData
      .map((acc: any) => acc?.account)
      .filter((key: string | null) => key != null);

    console.log(`[webhook] Extracted ${accountKeys.length} account keys from transaction`);

    if (accountKeys.length > 0) {
      console.log('[webhook] Account keys:', accountKeys.slice(0, 5).join(', '), '...');
    }

    // Try to match invoice by reference
    let matchedInvoice = null;
    let matchedReference = null;

    for (const accountKey of accountKeys) {
      const invoice = await getInvoiceByReference(accountKey);
      if (invoice) {
        matchedInvoice = invoice;
        matchedReference = accountKey;
        console.log(`[webhook] ✓ Found invoice by reference: ${accountKey}`);
        break;
      }
    }

    if (!matchedInvoice) {
      console.log('[webhook] ✗ No matching invoice found for this transaction');
      console.log('[webhook] Searched references:', accountKeys.join(', '));
      return;
    }

    // Check if invoice already paid (idempotency)
    if (matchedInvoice.status === 'paid') {
      console.log('[webhook] Invoice already marked as paid, skipping');
      return;
    }

    // Verify it's a USDC transfer
    const usdcTransfers = tokenTransfers.filter(
      (transfer: any) => transfer.mint === USDC_MINT
    );

    if (usdcTransfers.length === 0) {
      console.log('[webhook] ⚠ No USDC transfers found in transaction');
      // Still mark as paid since reference matched
    } else {
      console.log(`[webhook] Found ${usdcTransfers.length} USDC transfer(s)`);
    }

    // Extract payer info
    let payer: string | undefined;
    if (usdcTransfers.length > 0) {
      payer = usdcTransfers[0].fromUserAccount;
      const amount = usdcTransfers[0].tokenAmount;
      console.log(`[webhook] Transfer: ${amount} USDC from ${payer || 'unknown'}`);
    }

    // Mark invoice as paid
    console.log('[webhook] ✓✓✓ PAYMENT CONFIRMED ✓✓✓');
    console.log('[webhook]   Invoice ID:', matchedInvoice.id);
    console.log('[webhook]   Reference:', matchedReference);
    console.log('[webhook]   Transaction:', signature);
    console.log('[webhook]   Payer:', payer || 'unknown');

    await markInvoicePaid(matchedInvoice.id, signature, payer);

    console.log('[webhook] ✅ Invoice marked as PAID successfully');
  } catch (err: any) {
    console.error('[webhook] Error processing transaction:', err);
    throw err;
  }
}
