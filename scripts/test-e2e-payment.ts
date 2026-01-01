/**
 * End-to-End Payment Test Script
 * Tests the complete payment flow with REAL on-chain USDC payment
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;

// Configuration
const API_BASE = process.env.API_BASE || 'https://wino-business.vercel.app';
const MERCHANT_WALLET = process.env.NEXT_PUBLIC_MERCHANT_WALLET || 'G7Jhr2df7tEYxmjcHTUJuGyourBDHYw2Zh46ms6NjRDJ';
const SENDER_PRIVATE_KEY = process.env.SENDER_PRIVATE_KEY || '2x6Ne28Ljcd8D4rrGvavZ2MtEaQCntKqha3SiaWgT4R2rMTuoTuEVtfmUesmBzsCpJdP1syb9GqskXjN2EygD8K9';
const AMOUNT = parseFloat(process.env.AMOUNT || '0.01'); // Default: 0.01 USDC

async function runE2ETest() {
  console.log('================================================');
  console.log('Wino Business E2E Payment Test');
  console.log('================================================\n');

  console.log('Configuration:');
  console.log('  API Base:', API_BASE);
  console.log('  Merchant:', MERCHANT_WALLET);
  console.log('  Amount:', AMOUNT, 'USDC\n');

  // Step 1: Health check
  console.log('[1/6] Checking API health...');
  try {
    const healthResponse = await fetch(`${API_BASE}/api/health`);
    const health = await healthResponse.json();

    if (health.status !== 'healthy') {
      console.error('❌ API is not healthy:', health);
      process.exit(1);
    }

    console.log('✅ API is healthy\n');
  } catch (err) {
    console.error('❌ Health check failed:', err);
    process.exit(1);
  }

  // Step 2: Create invoice
  console.log('[2/6] Creating invoice...');
  let invoiceId: string;
  let referencePubkey: string;
  let solanaPayUrl: string;

  try {
    const response = await fetch(`${API_BASE}/api/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: MERCHANT_WALLET,
        amount: AMOUNT,
        allowCustomAmount: false,
        label: 'E2E Test Payment',
        message: 'Automated test invoice',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Invoice creation failed:', error);
      process.exit(1);
    }

    const invoice = await response.json();
    invoiceId = invoice.invoiceId;
    referencePubkey = invoice.referencePubkey;
    solanaPayUrl = invoice.solanaPayUrl;

    console.log('✅ Invoice created:');
    console.log('   ID:', invoiceId);
    console.log('   Reference:', referencePubkey);
    console.log('   Solana Pay URL:', solanaPayUrl);
    console.log('');
  } catch (err) {
    console.error('❌ Invoice creation failed:', err);
    process.exit(1);
  }

  // Step 3: Verify invoice retrieval
  console.log('[3/6] Verifying invoice retrieval...');
  try {
    const response = await fetch(`${API_BASE}/api/invoices/${invoiceId}`);

    if (!response.ok) {
      console.error('❌ Invoice retrieval failed: HTTP', response.status);
      process.exit(1);
    }

    const data = await response.json();
    console.log('✅ Invoice retrieved successfully');
    console.log('   Status:', data.invoice?.status || 'unknown');
    console.log('');
  } catch (err) {
    console.error('❌ Invoice retrieval failed:', err);
    process.exit(1);
  }

  // Step 4: Send REAL on-chain payment
  console.log('[4/6] Sending REAL on-chain USDC payment...');
  let txSignature: string;

  try {
    const senderKeypair = Keypair.fromSecretKey(bs58.decode(SENDER_PRIVATE_KEY));
    console.log('   Sender:', senderKeypair.publicKey.toBase58());

    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

    // Get sender and merchant USDC ATAs
    const usdcMint = new PublicKey(USDC_MINT);
    const merchantPubkey = new PublicKey(MERCHANT_WALLET);
    const reference = new PublicKey(referencePubkey);

    const senderAta = await getAssociatedTokenAddress(
      usdcMint,
      senderKeypair.publicKey
    );

    const merchantAta = await getAssociatedTokenAddress(
      usdcMint,
      merchantPubkey
    );

    console.log('   Sender USDC ATA:', senderAta.toBase58());
    console.log('   Merchant USDC ATA:', merchantAta.toBase58());

    // Check balance
    const balance = await connection.getTokenAccountBalance(senderAta);
    console.log('   Sender balance:', balance.value.uiAmount, 'USDC');

    if (!balance.value.uiAmount || balance.value.uiAmount < AMOUNT) {
      console.error('❌ Insufficient USDC balance');
      process.exit(1);
    }

    // Build transaction
    const amountMinor = BigInt(Math.round(AMOUNT * Math.pow(10, USDC_DECIMALS)));
    const transaction = new Transaction();

    // Add USDC transfer
    transaction.add(
      createTransferInstruction(
        senderAta,
        merchantAta,
        senderKeypair.publicKey,
        amountMinor,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Add reference as readonly account (Solana Pay standard)
    // Reference is included as an extra account in the instruction
    transaction.add(
      new TransactionInstruction({
        keys: [
          {
            pubkey: reference,
            isSigner: false,
            isWritable: false,
          },
        ],
        programId: new PublicKey('11111111111111111111111111111111'),
        data: Buffer.alloc(0),
      })
    );

    // Add memo
    const memoData = Buffer.from(`wino:${invoiceId}`, 'utf8');
    const memoProgramId = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    transaction.add(
      new TransactionInstruction({
        keys: [],
        programId: memoProgramId,
        data: memoData,
      })
    );

    console.log('   Sending transaction...');

    txSignature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [senderKeypair],
      { commitment: 'confirmed' }
    );

    console.log('✅ Payment sent successfully!');
    console.log('   Transaction:', txSignature);
    console.log('   Solscan:', `https://solscan.io/tx/${txSignature}`);
    console.log('');
  } catch (err: any) {
    console.error('❌ Payment failed:', err.message);
    process.exit(1);
  }

  // Step 5: Monitor invoice status (webhook should update it)
  console.log('[5/6] Monitoring invoice status (waiting for webhook)...');
  const startTime = Date.now();
  const timeout = 60000; // 60 seconds
  let statusUpdated = false;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${API_BASE}/api/invoices/${invoiceId}`);
      const data = await response.json();
      const invoice = data.invoice;

      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      if (invoice.status === 'paid') {
        console.log(`✅ Invoice status updated to PAID! (after ${elapsed}s)`);
        console.log('   Transaction:', invoice.paidTxSig);
        console.log('   Payer:', invoice.payer || 'unknown');
        statusUpdated = true;
        break;
      }

      process.stdout.write(`\r   [${elapsed}s] Status: ${invoice.status}...`);
    } catch (err) {
      // Ignore errors, keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log('');

  if (!statusUpdated) {
    console.log('⚠ Webhook did not update status within 60s');
    console.log('   Trying fallback verification...\n');

    // Step 6: Fallback on-chain verification
    console.log('[6/6] Triggering fallback verification...');
    try {
      const response = await fetch(`${API_BASE}/api/invoices/${invoiceId}/verify`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success && result.status === 'paid') {
        console.log('✅ Payment verified on-chain!');
        console.log('   Transaction:', result.txSignature);
        console.log('   Payer:', result.payer || 'unknown');
        statusUpdated = true;
      } else {
        console.log('❌ Verification failed:', result.message);
      }
    } catch (err) {
      console.error('❌ Verification error:', err);
    }
  }

  // Final summary
  console.log('\n================================================');
  if (statusUpdated) {
    console.log('✅ E2E TEST PASSED');
    console.log('   Invoice:', invoiceId);
    console.log('   Transaction:', txSignature);
    console.log('   Status: PAID');
  } else {
    console.log('❌ E2E TEST FAILED');
    console.log('   Invoice:', invoiceId);
    console.log('   Transaction:', txSignature);
    console.log('   Status: NOT UPDATED');
    console.log('\nPlease check:');
    console.log('   1. Helius webhook is configured');
    console.log('   2. Webhook auth header matches HELIUS_WEBHOOK_SECRET');
    console.log('   3. Webhook account address is merchant USDC ATA');
    console.log('   4. Storage (KV/Redis) is configured');
  }
  console.log('================================================\n');

  process.exit(statusUpdated ? 0 : 1);
}

runE2ETest().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
