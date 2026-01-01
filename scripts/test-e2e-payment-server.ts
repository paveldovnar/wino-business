/**
 * E2E Payment Test - Server-Automated Version
 * Uses server-side test payer to automate the full payment flow
 *
 * Steps:
 * 1. Create invoice via POST /api/invoices
 * 2. Pay invoice via POST /api/test/pay-invoice (server-side automation)
 * 3. Poll invoice status until paid/failed (2 minute timeout)
 * 4. Report PASS/FAIL with details
 *
 * Requirements:
 * - TEST_AUTOMATION_SECRET env var
 * - TEST_PAYER_PRIVATE_KEY in production env (Vercel)
 * - Test payer wallet has sufficient USDC
 */

const API_BASE = process.env.API_BASE || 'https://wino-business.vercel.app';
const MERCHANT_WALLET = process.env.NEXT_PUBLIC_MERCHANT_WALLET || 'G7Jhr2df7tEYxmjcHTUJuGyourBDHYw2Zh46ms6NjRDJ';
const TEST_AUTOMATION_SECRET = process.env.TEST_AUTOMATION_SECRET;
const AMOUNT = parseFloat(process.env.TEST_AMOUNT || '0.01');
const TIMEOUT_MS = 120000; // 2 minutes
const POLL_INTERVAL_MS = 2000; // 2 seconds

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runServerE2ETest() {
  console.log('================================================');
  console.log('Wino Business E2E Payment Test (Server-Automated)');
  console.log('================================================\n');

  console.log('Configuration:');
  console.log('  API Base:', API_BASE);
  console.log('  Merchant:', MERCHANT_WALLET);
  console.log('  Amount:', AMOUNT, 'USDC');
  console.log('  Timeout:', TIMEOUT_MS / 1000, 'seconds\n');

  if (!TEST_AUTOMATION_SECRET) {
    console.error('❌ TEST_AUTOMATION_SECRET environment variable is required');
    process.exit(1);
  }

  let invoiceId: string;
  let referencePubkey: string;
  let txSignature: string;

  // Step 1: Create invoice
  console.log('[1/4] Creating invoice...');
  try {
    const response = await fetch(`${API_BASE}/api/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: MERCHANT_WALLET,
        amount: AMOUNT,
        allowCustomAmount: false,
        label: 'E2E Test (Server-Automated)',
        message: 'Automated server test invoice',
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

    console.log('✅ Invoice created:');
    console.log('   ID:', invoiceId);
    console.log('   Reference:', referencePubkey);
    console.log('');
  } catch (err: any) {
    console.error('❌ Invoice creation failed:', err.message);
    process.exit(1);
  }

  // Step 2: Pay invoice via server automation
  console.log('[2/4] Paying invoice (server-automated)...');
  try {
    const response = await fetch(`${API_BASE}/api/test/pay-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_AUTOMATION_SECRET}`,
      },
      body: JSON.stringify({ invoiceId }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Payment failed:', error);
      console.log('\nPossible issues:');
      console.log('  - TEST_AUTOMATION_SECRET mismatch');
      console.log('  - TEST_PAYER_PRIVATE_KEY not configured');
      console.log('  - Test payer wallet has insufficient USDC');
      console.log('  - Invoice amount > 0.05 USDC');
      process.exit(1);
    }

    const result = await response.json();
    txSignature = result.signature;

    console.log('✅ Payment sent successfully:');
    console.log('   Transaction:', txSignature);
    console.log('   Solscan:', `https://solscan.io/tx/${txSignature}`);
    console.log('');
  } catch (err: any) {
    console.error('❌ Payment failed:', err.message);
    process.exit(1);
  }

  // Step 3: Poll invoice status
  console.log('[3/4] Monitoring invoice status (webhook detection)...');
  const startTime = Date.now();
  let statusUpdated = false;
  let finalInvoice: any = null;

  while (Date.now() - startTime < TIMEOUT_MS) {
    try {
      const response = await fetch(`${API_BASE}/api/invoices/${invoiceId}`);
      const data = await response.json();
      const invoice = data.invoice;

      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      if (invoice.status === 'paid') {
        console.log(`✅ Invoice status updated to PAID! (after ${elapsed}s)`);
        console.log('   Detected transaction:', invoice.paidTxSig);
        console.log('   Payer:', invoice.payer || 'unknown');
        statusUpdated = true;
        finalInvoice = invoice;
        break;
      }

      if (invoice.status === 'declined') {
        console.log(`❌ Invoice marked as DECLINED (after ${elapsed}s)`);
        statusUpdated = true;
        finalInvoice = invoice;
        break;
      }

      process.stdout.write(`\r   [${elapsed}s] Status: ${invoice.status}...`);
    } catch (err) {
      // Ignore errors, keep polling
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log('');

  // Step 4: Fallback verification if webhook didn't update
  if (!statusUpdated) {
    console.log('⚠️  Webhook did not update status within timeout');
    console.log('[4/4] Trying fallback verification...\n');

    try {
      const response = await fetch(`${API_BASE}/api/invoices/${invoiceId}/verify`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success && result.status === 'paid') {
        console.log('✅ Payment verified on-chain (fallback)!');
        console.log('   Transaction:', result.txSignature);
        console.log('   Payer:', result.payer || 'unknown');
        statusUpdated = true;
      } else {
        console.log('❌ Verification failed:', result.message);
      }
    } catch (err: any) {
      console.error('❌ Verification error:', err.message);
    }
  } else {
    console.log('[4/4] Webhook detection successful (no fallback needed)');
  }

  // Final report
  console.log('\n================================================');
  console.log('E2E TEST RESULTS');
  console.log('================================================\n');

  if (statusUpdated) {
    console.log('✅ PASS - Payment Detection Working!');
    console.log('');
    console.log('Details:');
    console.log('  Invoice ID:', invoiceId);
    console.log('  Reference:', referencePubkey);
    console.log('  Transaction:', txSignature);
    console.log('  Amount:', AMOUNT, 'USDC');
    console.log('  Detection Method:', finalInvoice ? 'Webhook' : 'Fallback');
    console.log('  Final Status:', finalInvoice?.status || 'paid');
    console.log('');
    console.log('System Performance:');
    console.log('  ✅ Invoice creation works');
    console.log('  ✅ Invoice persistence works (no 404)');
    console.log('  ✅ Payment sent successfully');
    console.log('  ✅ Payment detected and status updated');
    console.log('');
  } else {
    console.log('❌ FAIL - Payment Not Detected');
    console.log('');
    console.log('Details:');
    console.log('  Invoice ID:', invoiceId);
    console.log('  Reference:', referencePubkey);
    console.log('  Transaction:', txSignature);
    console.log('  Amount:', AMOUNT, 'USDC');
    console.log('');
    console.log('Issues to check:');
    console.log('  1. Helius webhook configuration');
    console.log('  2. Webhook auth header matches HELIUS_WEBHOOK_SECRET');
    console.log('  3. Webhook account address is merchant USDC ATA');
    console.log('  4. Storage (Redis/Vercel KV) is configured');
    console.log('  5. Reference matching logic in webhook handler');
    console.log('');
    console.log('Manual verification:');
    console.log(`  curl ${API_BASE}/api/invoices/${invoiceId}`);
    console.log(`  curl -X POST ${API_BASE}/api/invoices/${invoiceId}/verify`);
    console.log('');
  }

  console.log('================================================\n');

  process.exit(statusUpdated ? 0 : 1);
}

// Run test
runServerE2ETest().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
