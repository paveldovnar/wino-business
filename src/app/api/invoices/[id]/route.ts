import { NextRequest, NextResponse } from 'next/server';
import { getInvoice } from '@/server/storage/invoicesStore';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoice = await getInvoice(params.id);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (err: any) {
    console.error(`[GET /api/invoices/${params.id}] Error:`, err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
