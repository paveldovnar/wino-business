import { NextRequest, NextResponse } from 'next/server';
import { getInvoice } from '@/server/storage/invoicesStore';

/**
 * Get invoice status (set by Helius webhook)
 * No RPC verification - webhook updates status in real-time
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoice = await getInvoice(params.id);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Return stored status (updated by webhook)
    return NextResponse.json({
      status: invoice.status,
      paidTxSig: invoice.paidTxSig,
      payer: invoice.payer,
      amountUsd: invoice.amountUsd,
      createdAtSec: invoice.createdAtSec,
      paidAtSec: invoice.paidAtSec,
    });
  } catch (err: any) {
    console.error(`[GET /api/invoices/${params.id}/status] Error:`, err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
