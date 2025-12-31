import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, updateInvoice, listInvoices } from '@/server/storage/invoicesStore';
import { USDC_MINT, USDC_DECIMALS } from '@/server/solana/types';

/**
 * Helius Enhanced Webhook Handler
 * Receives transaction notifications and updates invoice status on payment detection.
 *
 * RECEIVE-ONLY: Only processes incoming USDC transfers to merchant.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify webhook authentication
    const authHeader = req.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.HELIUS_WEBHOOK_SECRET}`;

    if (!process.env.HELIUS_WEBHOOK_SECRET) {
      console.error('[helius-webhook] HELIUS_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    if (authHeader !== expectedAuth) {
      console.error('[helius-webhook] Invalid authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse webhook payload
    const payload = await req.json();
    console.log('[helius-webhook] Received webhook:', JSON.stringify(payload).slice(0, 500));

    // Enhanced webhooks come as array
    const transactions = Array.isArray(payload) ? payload : [payload];

    for (const txData of transactions) {
      await processTransaction(txData);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[helius-webhook] Error processing webhook:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function processTransaction(txData: any) {
  try {
    const signature = txData.signature;
    const accountData = txData.accountData || [];
    const tokenTransfers = txData.tokenTransfers || [];

    console.log(`[helius-webhook] Processing tx ${signature}`);
    console.log(`[helius-webhook] Token transfers: ${tokenTransfers.length}`);

    if (tokenTransfers.length === 0) {
      console.log('[helius-webhook] No token transfers, skipping');
      return;
    }

    // Find USDC transfers
    const usdcTransfers = tokenTransfers.filter((transfer: any) =>
      transfer.mint === USDC_MINT
    );

    if (usdcTransfers.length === 0) {
      console.log('[helius-webhook] No USDC transfers, skipping');
      return;
    }

    console.log(`[helius-webhook] Found ${usdcTransfers.length} USDC transfers`);

    // Get all pending invoices
    const allInvoices = await listInvoices();
    const pendingInvoices = allInvoices.filter(inv => inv.status === 'pending');

    if (pendingInvoices.length === 0) {
      console.log('[helius-webhook] No pending invoices');
      return;
    }

    // Extract all account keys from transaction
    const accountKeys = new Set<string>();
    if (txData.transaction?.message?.accountKeys) {
      for (const key of txData.transaction.message.accountKeys) {
        accountKeys.add(typeof key === 'string' ? key : key.pubkey);
      }
    }

    // Try to match transfers to invoices
    for (const transfer of usdcTransfers) {
      const toTokenAccount = transfer.toTokenAccount;
      const fromUserAccount = transfer.fromUserAccount;
      const amount = transfer.tokenAmount;

      console.log(`[helius-webhook] Transfer: ${amount} USDC to ${toTokenAccount}`);

      // Find matching invoice
      for (const invoice of pendingInvoices) {
        // Check if transfer is to merchant's USDC ATA
        if (toTokenAccount !== invoice.merchantUsdcAta) {
          continue;
        }

        console.log(`[helius-webhook] Matched merchant ATA for invoice ${invoice.id}`);

        // Check if reference is in transaction
        if (!accountKeys.has(invoice.referencePubkey)) {
          console.log(`[helius-webhook] Reference ${invoice.referencePubkey} not in tx accountKeys`);
          continue;
        }

        console.log(`[helius-webhook] ✓ Reference matched for invoice ${invoice.id}`);

        // Validate amount (if not custom)
        if (invoice.amountMinor) {
          const expectedAmount = BigInt(invoice.amountMinor);
          const receivedAmount = BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS)));

          if (receivedAmount < expectedAmount) {
            console.log(`[helius-webhook] Amount too low: ${receivedAmount} < ${expectedAmount}`);
            continue;
          }
        } else {
          // Custom amount - just check > 0
          if (amount <= 0) {
            console.log('[helius-webhook] Amount is zero');
            continue;
          }
        }

        // Payment matched!
        console.log(`[helius-webhook] ✓✓✓ PAYMENT MATCHED for invoice ${invoice.id}`);
        console.log(`[helius-webhook] Signature: ${signature}`);
        console.log(`[helius-webhook] Amount: ${amount} USDC`);
        console.log(`[helius-webhook] From: ${fromUserAccount}`);

        await updateInvoice(invoice.id, {
          status: 'paid',
          paidTxSig: signature,
          paidAtSec: Math.floor(Date.now() / 1000),
          payer: fromUserAccount,
        });

        console.log(`[helius-webhook] Invoice ${invoice.id} marked as PAID`);

        // Stop checking other invoices for this transfer
        break;
      }
    }
  } catch (err) {
    console.error('[helius-webhook] Error processing transaction:', err);
  }
}
