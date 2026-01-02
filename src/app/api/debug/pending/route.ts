import { NextRequest, NextResponse } from 'next/server';
import { getPendingInvoiceByMerchantAta } from '@/server/storage/invoicesStore';

/**
 * GET /api/debug/pending
 * Debug endpoint to check pending invoice for a merchant ATA
 *
 * Query params:
 * - merchantAta: Merchant's USDC ATA (required)
 *
 * Returns the current pending invoice or null
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const merchantAta = searchParams.get('merchantAta');

    if (!merchantAta) {
      return NextResponse.json(
        { error: 'Missing merchantAta query parameter' },
        { status: 400 }
      );
    }

    const invoice = await getPendingInvoiceByMerchantAta(merchantAta);

    if (!invoice) {
      return NextResponse.json({
        merchantAta,
        pendingInvoice: null,
        message: 'No pending invoice for this merchant ATA',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const isExpired = now > invoice.expiresAtSec;
    const timeLeft = invoice.expiresAtSec - now;

    return NextResponse.json({
      merchantAta,
      pendingInvoice: {
        id: invoice.id,
        amount: invoice.amountUsd,
        status: invoice.status,
        createdAt: invoice.createdAtSec,
        expiresAt: invoice.expiresAtSec,
        paidTxSig: invoice.paidTxSig,
        payer: invoice.payer,
      },
      debug: {
        isExpired,
        timeLeftSec: isExpired ? 0 : timeLeft,
        timeLeftMin: isExpired ? 0 : Math.floor(timeLeft / 60),
      },
    });
  } catch (err: any) {
    console.error('[debug/pending] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
