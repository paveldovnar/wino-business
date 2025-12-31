import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Keypair } from '@solana/web3.js';
import { createInvoice } from '@/server/storage/invoicesStore';
import { getAssociatedTokenAddress, USDC_MINT } from '@/server/solana/utils';
import { StoredInvoice, USDC_DECIMALS } from '@/server/solana/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipient, amount, allowCustomAmount, label, message } = body;

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

    // Generate unique reference keypair (public key only)
    const referenceKeypair = Keypair.generate();
    const referencePubkey = referenceKeypair.publicKey.toBase58();

    // Create invoice
    const invoiceId = crypto.randomUUID();
    const nowSec = Math.floor(Date.now() / 1000);

    // Calculate amount in minor units (base units) if specified
    let amountUsd: number | undefined;
    let amountMinor: string | undefined;

    if (!allowCustomAmount && amount) {
      amountUsd = amount;
      amountMinor = BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS))).toString();
    }

    const invoice: StoredInvoice = {
      id: invoiceId,
      merchantWallet: recipient,
      merchantUsdcAta: merchantUsdcAta.toBase58(),
      amountUsd,
      amountMinor,
      referencePubkey,
      label: label || 'Wino Business',
      message: message || `Invoice ${invoiceId.slice(0, 8)}`,
      status: 'pending',
      createdAtSec: nowSec,
    };

    await createInvoice(invoice);

    // Build Solana Pay URI
    const url = new URL(`solana:${recipient}`);
    url.searchParams.set('spl-token', USDC_MINT);
    if (amountUsd) {
      url.searchParams.set('amount', amountUsd.toString());
    }
    url.searchParams.set('reference', referencePubkey);
    url.searchParams.set('label', invoice.label || 'Wino Business');
    url.searchParams.set('message', invoice.message || `Invoice ${invoiceId.slice(0, 8)}`);

    const solanaPayUrl = url.toString();

    console.log(`[POST /api/invoices] Created invoice ${invoice.id}`);
    console.log(`[POST /api/invoices] Merchant ATA: ${invoice.merchantUsdcAta}`);
    console.log(`[POST /api/invoices] Reference: ${referencePubkey}`);

    return NextResponse.json({
      invoiceId: invoice.id,
      solanaPayUrl,
      referencePubkey,
      merchantUsdcAta: invoice.merchantUsdcAta,
      amountUsd: invoice.amountUsd,
    });
  } catch (err: any) {
    console.error('[POST /api/invoices] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
