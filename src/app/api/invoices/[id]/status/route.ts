import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, updateInvoice } from '@/server/storage/invoicesStore';
import { verifyInvoicePayment } from '@/server/solana/verifyInvoice';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoice = await getInvoice(params.id);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // If already paid or expired, return cached status
    if (invoice.status !== 'pending') {
      return NextResponse.json({
        status: invoice.status,
        signature: invoice.signature,
        payer: invoice.payer,
      });
    }

    // Check if expired
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > invoice.expiresAtSec) {
      await updateInvoice(invoice.id, { status: 'expired' });
      return NextResponse.json({ status: 'expired' });
    }

    // Verify on-chain
    const isDev = process.env.NODE_ENV === 'development';
    const result = await verifyInvoicePayment(invoice, isDev);

    if (result.paid) {
      // Update invoice status
      await updateInvoice(invoice.id, {
        status: 'paid',
        signature: result.signature,
        payer: result.payer,
      });

      return NextResponse.json({
        status: 'paid',
        signature: result.signature,
        payer: result.payer,
        matchedAmount: result.matchedAmount,
        debug: result.debug,
      });
    }

    // Still pending
    return NextResponse.json({
      status: 'pending',
      debug: result.debug,
    });
  } catch (err: any) {
    console.error(`[GET /api/invoices/${params.id}/status] Error:`, err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
