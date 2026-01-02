import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, updateInvoice } from '@/server/storage/invoicesStore';

/**
 * POST /api/invoices/:id/extend
 * Extends invoice expiration by 120 seconds
 * Only works if invoice status is still "pending"
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;

    // Load invoice
    const invoice = await getInvoice(invoiceId);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Only extend if still pending
    if (invoice.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot extend invoice with status: ${invoice.status}` },
        { status: 400 }
      );
    }

    // Extend expiration: max(currentExpiry, now) + 120 seconds
    const nowSec = Math.floor(Date.now() / 1000);
    const baseTime = Math.max(invoice.expiresAtSec, nowSec);
    const newExpiresAtSec = baseTime + 120;

    // Update invoice
    await updateInvoice(invoiceId, {
      expiresAtSec: newExpiresAtSec,
    });

    console.log('[POST /api/invoices/:id/extend] Extended invoice expiration:', {
      invoiceId,
      oldExpiry: invoice.expiresAtSec,
      newExpiry: newExpiresAtSec,
    });

    return NextResponse.json({
      success: true,
      expiresAtSec: newExpiresAtSec,
      invoiceId,
    });
  } catch (err: any) {
    console.error('[POST /api/invoices/:id/extend] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
