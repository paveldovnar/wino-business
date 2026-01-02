import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Keypair } from '@solana/web3.js';
import {
  createInvoice,
  listInvoices,
  expirePendingInvoicesForMerchant,
} from '@/server/storage/invoicesStore';
import { getAssociatedTokenAddress, USDC_MINT } from '@/server/solana/utils';
import { StoredInvoice, USDC_DECIMALS } from '@/server/solana/types';

/**
 * GET /api/invoices - List recent invoices
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const invoices = await listInvoices(limit);

    return NextResponse.json({ invoices });
  } catch (err: any) {
    console.error('[GET /api/invoices] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invoices - Create new invoice
 * Reference-based matching (no micro-decimals)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipient, amount, allowCustomAmount, label, message } = body;

    console.log('[POST /api/invoices] Creating invoice:', {
      recipient,
      amount,
      allowCustomAmount,
    });

    if (!recipient) {
      return NextResponse.json({ error: 'Missing recipient' }, { status: 400 });
    }

    // Validate recipient is valid pubkey
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid recipient address' },
        { status: 400 }
      );
    }

    // Compute merchant USDC ATA
    const usdcMint = new PublicKey(USDC_MINT);
    const merchantUsdcAta = await getAssociatedTokenAddress(
      recipientPubkey,
      usdcMint
    );

    console.log('[POST /api/invoices] Merchant USDC ATA:', merchantUsdcAta.toBase58());

    // SINGLE PENDING INVOICE ENFORCEMENT:
    // Expire all existing pending invoices for this merchant ATA
    // (One POS terminal = one active pending invoice at a time)
    try {
      const expiredCount = await expirePendingInvoicesForMerchant(merchantUsdcAta.toBase58());
      if (expiredCount > 0) {
        console.log(`[POST /api/invoices] Expired ${expiredCount} old pending invoice(s)`);
      }
    } catch (expireErr: any) {
      console.error('[POST /api/invoices] Error expiring old invoices:', expireErr);
      // Continue anyway - don't block new invoice creation
    }

    // Generate reference for backward compatibility (not used in URL)
    const referenceKeypair = Keypair.generate();
    const referencePubkey = referenceKeypair.publicKey.toBase58();

    // Create invoice
    const invoiceId = crypto.randomUUID();
    const nowSec = Math.floor(Date.now() / 1000);

    // Calculate amount in minor units (base units) if specified
    let amountUsd: number | undefined;
    let amountMinor: string | undefined;

    if (!allowCustomAmount && amount !== undefined) {
      amountUsd = amount;
      // Convert to minor units (e.g., 1.00 USDC -> 1000000)
      amountMinor = BigInt(
        Math.round(amount * Math.pow(10, USDC_DECIMALS))
      ).toString();
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
      expiresAtSec: nowSec + 120, // 2 minutes (120 seconds) expiration
    };

    // Persist invoice to storage (CRITICAL: must succeed or fail explicitly)
    try {
      await createInvoice(invoice);
    } catch (storageErr: any) {
      console.error('[POST /api/invoices] Storage error:', storageErr);
      return NextResponse.json(
        {
          error: 'Failed to create invoice',
          details: storageErr.message,
        },
        { status: 500 }
      );
    }

    // Build Solana Pay URI (NO reference or memo - amount-only matching)
    const url = new URL(`solana:${recipient}`);
    url.searchParams.set('spl-token', USDC_MINT);
    if (amountUsd) {
      url.searchParams.set('amount', amountUsd.toString());
    }
    // NOTE: Reference and memo removed - payment matching is amount-only
    url.searchParams.set('label', invoice.label || 'Wino Business');
    url.searchParams.set('message', invoice.message || `Invoice ${invoiceId.slice(0, 8)}`);

    const solanaPayUrl = url.toString();

    console.log('[POST /api/invoices] ✅ Invoice created successfully');
    console.log('[POST /api/invoices]   ID:', invoice.id);
    console.log('[POST /api/invoices]   Amount:', amountUsd, 'USDC');
    console.log('[POST /api/invoices]   Merchant ATA:', invoice.merchantUsdcAta);

    return NextResponse.json({
      invoiceId: invoice.id,
      solanaPayUrl,
      merchantUsdcAta: invoice.merchantUsdcAta,
      amountUsd: invoice.amountUsd,
    });
  } catch (err: any) {
    console.error('[POST /api/invoices] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
