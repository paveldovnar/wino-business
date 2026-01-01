import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getInvoice } from '@/server/storage/invoicesStore';
import { USDC_MINT, USDC_DECIMALS } from '@/server/solana/types';
import bs58 from 'bs58';

/**
 * POST /api/test/pay-invoice
 * Server-side automated payment for E2E testing
 *
 * SECURITY:
 * - Requires Authorization: Bearer <TEST_AUTOMATION_SECRET>
 * - Hard cap: 0.05 USDC maximum
 * - Private key never logged
 * - Production use only for testing
 */

const MAX_AMOUNT_USDC = 0.05;
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export async function POST(req: NextRequest) {
  try {
    // 1. Authorization check
    const authHeader = req.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.TEST_AUTOMATION_SECRET}`;

    if (!process.env.TEST_AUTOMATION_SECRET) {
      console.error('[test/pay-invoice] TEST_AUTOMATION_SECRET not configured');
      return NextResponse.json({ error: 'Test automation not configured' }, { status: 500 });
    }

    if (authHeader !== expectedAuth) {
      console.error('[test/pay-invoice] Invalid authorization');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request
    const body = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
    }

    console.log('[test/pay-invoice] Processing payment for invoice:', invoiceId);

    // 3. Load invoice
    const invoice = await getInvoice(invoiceId);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // 4. Validate invoice status
    if (invoice.status !== 'pending') {
      return NextResponse.json(
        { error: `Invoice status is ${invoice.status}, expected pending` },
        { status: 400 }
      );
    }

    // 5. Validate amount
    if (!invoice.amountUsd || invoice.amountUsd > MAX_AMOUNT_USDC) {
      return NextResponse.json(
        { error: `Invoice amount ${invoice.amountUsd} exceeds max ${MAX_AMOUNT_USDC} USDC` },
        { status: 400 }
      );
    }

    console.log('[test/pay-invoice] Invoice validated:', {
      id: invoiceId,
      amount: invoice.amountUsd,
      reference: invoice.referencePubkey,
      merchantAta: invoice.merchantUsdcAta,
    });

    // 6. Load test payer
    const payerPrivateKey = process.env.TEST_PAYER_PRIVATE_KEY;
    if (!payerPrivateKey) {
      console.error('[test/pay-invoice] TEST_PAYER_PRIVATE_KEY not configured');
      return NextResponse.json({ error: 'Test payer not configured' }, { status: 500 });
    }

    const payerKeypair = Keypair.fromSecretKey(bs58.decode(payerPrivateKey));
    console.log('[test/pay-invoice] Test payer:', payerKeypair.publicKey.toBase58());

    // 7. Build transaction
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const usdcMint = new PublicKey(USDC_MINT);
    const merchantAta = new PublicKey(invoice.merchantUsdcAta);
    const reference = new PublicKey(invoice.referencePubkey);

    // Get payer's USDC ATA
    const payerAta = await getAssociatedTokenAddress(usdcMint, payerKeypair.publicKey);

    console.log('[test/pay-invoice] Payer USDC ATA:', payerAta.toBase58());

    // Check balance
    try {
      const balance = await connection.getTokenAccountBalance(payerAta);
      console.log('[test/pay-invoice] Payer balance:', balance.value.uiAmount, 'USDC');

      if (!balance.value.uiAmount || balance.value.uiAmount < invoice.amountUsd) {
        return NextResponse.json(
          { error: `Insufficient balance: ${balance.value.uiAmount} USDC` },
          { status: 400 }
        );
      }
    } catch (err) {
      console.error('[test/pay-invoice] Error checking balance:', err);
      return NextResponse.json({ error: 'Failed to check payer balance' }, { status: 500 });
    }

    // Build transaction
    const transaction = new Transaction();

    // Add USDC transfer with reference (Solana Pay standard)
    const amountMinor = BigInt(Math.round(invoice.amountUsd * Math.pow(10, USDC_DECIMALS)));
    const transferInstruction = createTransferInstruction(
      payerAta,
      merchantAta,
      payerKeypair.publicKey,
      amountMinor,
      [],
      TOKEN_PROGRAM_ID
    );

    // Add reference as additional readonly account key
    transferInstruction.keys.push({
      pubkey: reference,
      isSigner: false,
      isWritable: false,
    });

    transaction.add(transferInstruction);

    // Add memo
    const memoData = Buffer.from(`wino:${invoiceId}`, 'utf8');
    transaction.add(
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: memoData,
      })
    );

    console.log('[test/pay-invoice] Sending transaction...');
    console.log('[test/pay-invoice]   Amount:', invoice.amountUsd, 'USDC');
    console.log('[test/pay-invoice]   To ATA:', merchantAta.toBase58());
    console.log('[test/pay-invoice]   Reference:', reference.toBase58());

    // 8. Send transaction (without waiting for confirmation to avoid timeout)
    let signature: string;
    try {
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = payerKeypair.publicKey;

      // Sign and send transaction
      transaction.sign(payerKeypair);
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } catch (err: any) {
      console.error('[test/pay-invoice] Transaction failed:', err.message);
      return NextResponse.json({ error: `Transaction failed: ${err.message}` }, { status: 500 });
    }

    console.log('[test/pay-invoice] ✅ Payment sent (confirmation pending)');
    console.log('[test/pay-invoice]   Invoice:', invoiceId);
    console.log('[test/pay-invoice]   Signature:', signature);
    console.log('[test/pay-invoice]   Note: Webhook will update invoice status once confirmed');

    return NextResponse.json({
      ok: true,
      invoiceId,
      signature,
    });
  } catch (err: any) {
    console.error('[test/pay-invoice] Error:', err.message);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
