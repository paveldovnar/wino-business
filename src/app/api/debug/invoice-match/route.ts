import { NextRequest, NextResponse } from 'next/server';
import {
  getInvoice,
  findInvoicesByFallbackMatch,
  getPendingInvoices,
} from '@/server/storage/invoicesStore';

/**
 * GET /api/debug/invoice-match
 * Debug endpoint to test invoice matching logic
 *
 * Query params:
 * - invoiceId: Get specific invoice details
 * - merchantAta: Merchant's USDC ATA for fallback matching
 * - amount: Amount in USDC for fallback matching
 * - timestamp: Unix timestamp for fallback matching (defaults to now)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get('invoiceId');
    const merchantAta = searchParams.get('merchantAta');
    const amountStr = searchParams.get('amount');
    const timestampStr = searchParams.get('timestamp');

    // Mode 1: Get specific invoice
    if (invoiceId) {
      const invoice = await getInvoice(invoiceId);
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      const now = Math.floor(Date.now() / 1000);
      const isExpired = now > invoice.expiresAtSec;
      const timeLeft = invoice.expiresAtSec - now;

      return NextResponse.json({
        invoice,
        debug: {
          isExpired,
          timeLeftSec: isExpired ? 0 : timeLeft,
          timeLeftMin: isExpired ? 0 : Math.floor(timeLeft / 60),
        },
      });
    }

    // Mode 2: Test fallback matching
    if (merchantAta && amountStr) {
      const amount = parseFloat(amountStr);
      const timestamp = timestampStr ? parseInt(timestampStr, 10) : Math.floor(Date.now() / 1000);

      if (isNaN(amount)) {
        return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
      }

      const matches = await findInvoicesByFallbackMatch(merchantAta, amount, timestamp);

      return NextResponse.json({
        query: {
          merchantAta,
          amount,
          timestamp,
        },
        matches: matches.map((m) => ({
          id: m.id,
          amount: m.amountUsd,
          createdAt: m.createdAtSec,
          expiresAt: m.expiresAtSec,
          status: m.status,
          needsReview: m.needsReview,
        })),
        matchCount: matches.length,
        result:
          matches.length === 0
            ? 'No matches'
            : matches.length === 1
              ? 'Single match - would auto-approve'
              : 'Multiple matches - would require review',
      });
    }

    // Mode 3: List all pending invoices
    const pending = await getPendingInvoices();
    return NextResponse.json({
      pendingInvoices: pending.map((inv) => ({
        id: inv.id,
        amount: inv.amountUsd,
        merchantAta: inv.merchantUsdcAta,
        createdAt: inv.createdAtSec,
        expiresAt: inv.expiresAtSec,
        needsReview: inv.needsReview,
      })),
      count: pending.length,
    });
  } catch (err: any) {
    console.error('[debug/invoice-match] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
