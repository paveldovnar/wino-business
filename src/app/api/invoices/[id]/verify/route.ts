import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { findReference } from '@solana/pay';
import { getInvoice, markInvoicePaid } from '@/server/storage/invoicesStore';

/**
 * POST /api/invoices/:id/verify
 * Fallback verification using on-chain reference lookup
 * Used when webhook hasn't fired or client needs immediate status
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    console.log(`[verify] Verifying invoice ${invoiceId}`);

    // Get invoice
    const invoice = await getInvoice(invoiceId);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // If already paid, return success
    if (invoice.status === 'paid') {
      console.log(`[verify] Invoice ${invoiceId} already paid`);
      return NextResponse.json({
        success: true,
        status: 'paid',
        message: 'Invoice already marked as paid',
        txSignature: invoice.paidTxSig,
      });
    }

    // Try to find transaction on-chain using reference
    console.log(`[verify] Looking for on-chain transaction with reference: ${invoice.referencePubkey}`);

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    try {
      const reference = new PublicKey(invoice.referencePubkey);

      // Use @solana/pay findReference to locate the transaction
      const signatureInfo = await findReference(connection, reference, {
        finality: 'confirmed',
      });

      const signature = signatureInfo.signature;
      console.log(`[verify] ✓ Found transaction on-chain: ${signature}`);

      // Get transaction details to extract payer
      const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      let payer: string | undefined;
      if (tx && tx.transaction.message.accountKeys.length > 0) {
        payer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
      }

      // Mark invoice as paid
      await markInvoicePaid(invoiceId, signature, payer);

      console.log(`[verify] ✅ Invoice ${invoiceId} verified and marked as paid`);

      return NextResponse.json({
        success: true,
        status: 'paid',
        message: 'Payment verified on-chain',
        txSignature: signature,
        payer,
      });
    } catch (findErr: any) {
      // Transaction not found yet
      console.log(`[verify] No transaction found on-chain yet: ${findErr.message}`);

      return NextResponse.json({
        success: false,
        status: 'pending',
        message: 'Payment not yet confirmed on-chain',
      });
    }
  } catch (err: any) {
    console.error(`[verify] Error verifying invoice ${params.id}:`, err);
    return NextResponse.json(
      { error: err.message || 'Verification failed' },
      { status: 500 }
    );
  }
}
