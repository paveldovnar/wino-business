import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Keypair } from '@solana/web3.js';
import { createInvoice } from '@/server/storage/invoicesStore';
import { getAssociatedTokenAddress, USDC_MINT } from '@/server/solana/utils';
import { StoredInvoice } from '@/server/solana/verifyInvoice';

const INVOICE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipient, amount, allowCustomAmount } = body;

    if (!recipient) {
      return NextResponse.json({ error: 'Missing recipient' }, { status: 400 });
    }

    // Validate recipient is valid pubkey
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch (err) {
      return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 });
    }

    // Compute merchant USDC ATA
    const usdcMint = new PublicKey(USDC_MINT);
    const merchantUsdcAta = await getAssociatedTokenAddress(recipientPubkey, usdcMint);

    // Generate unique reference
    const referenceKeypair = Keypair.generate();
    const reference = referenceKeypair.publicKey.toBase58();

    // Create invoice
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);
    const expiresSec = Math.floor((now + INVOICE_TIMEOUT_MS) / 1000);

    const invoice: StoredInvoice = {
      id: crypto.randomUUID(),
      createdAtSec: nowSec,
      expiresAtSec: expiresSec,
      recipient,
      merchantUsdcAta: merchantUsdcAta.toBase58(),
      reference,
      expectedAmount: allowCustomAmount ? undefined : amount,
      status: 'pending',
    };

    await createInvoice(invoice);

    // Build Solana Pay URI
    const url = new URL(`solana:${recipient}`);
    url.searchParams.set('spl-token', USDC_MINT);
    if (!allowCustomAmount && amount) {
      url.searchParams.set('amount', amount.toString());
    }
    url.searchParams.set('reference', reference);
    url.searchParams.set('label', 'Wino Business');
    url.searchParams.set('message', `Invoice ${invoice.id.slice(0, 8)}`);

    const solanaPayUri = url.toString();

    console.log(`[POST /api/invoices] Created invoice ${invoice.id}`);

    return NextResponse.json({
      invoice,
      solanaPayUri,
    });
  } catch (err: any) {
    console.error('[POST /api/invoices] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
