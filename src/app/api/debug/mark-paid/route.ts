import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, markInvoicePaid } from '@/server/storage/invoicesStore';

/**
 * Debug endpoint to manually mark an invoice as PAID
 *
 * POST /api/debug/mark-paid
 * Body: { invoiceId: string }
 * Header: Authorization: Bearer DEBUG_SECRET
 *
 * This endpoint is protected by DEBUG_SECRET env var and should only be used for testing.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify authorization
    const authHeader = req.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.DEBUG_SECRET}`;

    if (!process.env.DEBUG_SECRET) {
      console.error('[debug/mark-paid] DEBUG_SECRET not configured');
      return NextResponse.json({ error: 'Debug endpoint not configured' }, { status: 500 });
    }

    if (authHeader !== expectedAuth) {
      console.error('[debug/mark-paid] Invalid authorization');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request
    const body = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
    }

    // 3. Check if invoice exists
    const invoice = await getInvoice(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // 4. Mark as paid (with test signature)
    const testSignature = `debug_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await markInvoicePaid(invoiceId, testSignature, 'debug-payer');

    console.log(`[debug/mark-paid] Invoice ${invoiceId} marked as PAID (test mode)`);

    return NextResponse.json({
      success: true,
      invoiceId,
      status: 'paid',
      testSignature,
    });
  } catch (err: any) {
    console.error('[debug/mark-paid] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
