import { NextRequest, NextResponse } from 'next/server';
import { listInvoices } from '@/server/storage/invoicesStore';

/**
 * GET /api/transactions
 * Returns invoices (transactions) for a specific merchant ATA
 * Ordered by (paidAtSec || createdAtSec) desc
 * Limit 50
 *
 * Query params:
 * - merchantAta: Merchant's USDC ATA (required)
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

    // Get all invoices (up to 100)
    const allInvoices = await listInvoices(100);

    // Filter by merchant ATA
    const merchantInvoices = allInvoices.filter(
      (inv) => inv.merchantUsdcAta === merchantAta
    );

    // Sort by paidAtSec (if paid) or createdAtSec, descending
    const sorted = merchantInvoices.sort((a, b) => {
      const aTime = a.paidAtSec || a.createdAtSec;
      const bTime = b.paidAtSec || b.createdAtSec;
      return bTime - aTime;
    });

    // Limit to 50
    const limited = sorted.slice(0, 50);

    // Map to transaction format
    const transactions = limited.map((inv) => ({
      id: inv.id,
      status: inv.status,
      amountUsd: inv.amountUsd,
      createdAt: inv.createdAtSec,
      paidAt: inv.paidAtSec,
      paidTxSig: inv.paidTxSig,
      payer: inv.payer,
    }));

    return NextResponse.json({
      transactions,
      count: transactions.length,
    });
  } catch (err: any) {
    console.error('[GET /api/transactions] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
