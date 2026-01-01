# Testing Guide - Wino Business E2E Payment System

## Overview

This guide covers automated E2E testing of the Solana Pay payment detection system using server-side automation.

---

## Test Types

### 1. Server-Automated E2E Test (Recommended)
Fully automated test that creates invoice, sends payment, and verifies detection.

**Advantages:**
- No manual wallet interaction
- Fast execution (~10-30 seconds)
- Reproducible results
- CI/CD compatible

**Disadvantages:**
- Requires test wallet with USDC
- Needs server-side private key

### 2. Manual E2E Test
Manual test using mobile wallet to scan QR and pay.

**Advantages:**
- Tests real user flow
- No server-side secrets needed

**Disadvantages:**
- Slow (manual intervention)
- Not CI/CD friendly

---

## Server-Automated E2E Testing

### Prerequisites

1. **Environment Variables** (add to Vercel AND local `.env.local`):

```bash
# Test automation secret (generate with: openssl rand -base64 32)
TEST_AUTOMATION_SECRET=your_random_secret_here

# Test payer wallet private key (base58 encoded)
# This wallet will send USDC payments for testing
TEST_PAYER_PRIVATE_KEY=your_test_wallet_private_key_here

# Optional: customize test amount (default: 0.01 USDC, max: 0.05 USDC)
TEST_AMOUNT=0.01
```

2. **Test Wallet Setup:**

The test payer wallet needs USDC on Solana mainnet:

```bash
# Get test payer address
npx tsx -e "
  import { Keypair } from '@solana/web3.js';
  import bs58 from 'bs58';
  const key = process.env.TEST_PAYER_PRIVATE_KEY;
  if (!key) {
    console.log('TEST_PAYER_PRIVATE_KEY not set');
    process.exit(1);
  }
  const kp = Keypair.fromSecretKey(bs58.decode(key));
  console.log('Test Payer Address:', kp.publicKey.toBase58());
"

# Send ~1 USDC to this address for testing
# You'll be able to run ~100 tests with 1 USDC (0.01 each)
```

### Running the Test

#### Local Development:

```bash
# Ensure env vars are set in .env.local
npm run build

# Run against production
API_BASE=https://wino-business.vercel.app \
  npx tsx scripts/test-e2e-payment-server.ts
```

#### CI/CD (GitHub Actions example):

```yaml
- name: E2E Payment Test
  env:
    TEST_AUTOMATION_SECRET: ${{ secrets.TEST_AUTOMATION_SECRET }}
    TEST_PAYER_PRIVATE_KEY: ${{ secrets.TEST_PAYER_PRIVATE_KEY }}
    API_BASE: https://wino-business.vercel.app
  run: npx tsx scripts/test-e2e-payment-server.ts
```

### Expected Output

**Success:**
```
================================================
Wino Business E2E Payment Test (Server-Automated)
================================================

Configuration:
  API Base: https://wino-business.vercel.app
  Merchant: G7Jhr2df7tEYxmjcHTUJuGyourBDHYw2Zh46ms6NjRDJ
  Amount: 0.01 USDC
  Timeout: 120 seconds

[1/4] Creating invoice...
✅ Invoice created:
   ID: abc123...
   Reference: xyz789...

[2/4] Paying invoice (server-automated)...
✅ Payment sent successfully:
   Transaction: 5K8j...
   Solscan: https://solscan.io/tx/5K8j...

[3/4] Monitoring invoice status (webhook detection)...
✅ Invoice status updated to PAID! (after 5s)
   Detected transaction: 5K8j...
   Payer: 4FfT...

[4/4] Webhook detection successful (no fallback needed)

================================================
E2E TEST RESULTS
================================================

✅ PASS - Payment Detection Working!

Details:
  Invoice ID: abc123...
  Reference: xyz789...
  Transaction: 5K8j...
  Amount: 0.01 USDC
  Detection Method: Webhook
  Final Status: paid

System Performance:
  ✅ Invoice creation works
  ✅ Invoice persistence works (no 404)
  ✅ Payment sent successfully
  ✅ Payment detected and status updated

================================================
```

**Failure (Webhook Not Configured):**
```
[3/4] Monitoring invoice status (webhook detection)...
   [120s] Status: pending...
⚠️  Webhook did not update status within timeout
[4/4] Trying fallback verification...

✅ Payment verified on-chain (fallback)!
   Transaction: 5K8j...

================================================
E2E TEST RESULTS
================================================

✅ PASS - Payment Detection Working!
...
  Detection Method: Fallback
...
```

---

## Security & Safety

### Environment Variable Protection

**NEVER commit secrets to git:**

```bash
# .env.local (gitignored)
TEST_AUTOMATION_SECRET=xxx
TEST_PAYER_PRIVATE_KEY=xxx

# Add to Vercel via Dashboard → Settings → Environment Variables
```

### Amount Limits

The test endpoint enforces a **hard cap of 0.05 USDC** per payment:

```typescript
// src/app/api/test/pay-invoice/route.ts
const MAX_AMOUNT_USDC = 0.05;

if (invoice.amountUsd > MAX_AMOUNT_USDC) {
  return 400; // Amount exceeds max
}
```

### Authorization

All test automation requests require Bearer token:

```bash
Authorization: Bearer <TEST_AUTOMATION_SECRET>
```

Without valid auth → **401 Unauthorized**

### Private Key Logging

Private keys are **NEVER logged**. Only public addresses and signatures:

```typescript
// ✅ Safe to log
console.log('Test payer:', payerKeypair.publicKey.toBase58());
console.log('Signature:', signature);

// ❌ NEVER logged
// console.log('Private key:', process.env.TEST_PAYER_PRIVATE_KEY);
```

---

## Troubleshooting

### Test fails with "Unauthorized"

**Issue:** `TEST_AUTOMATION_SECRET` mismatch

**Fix:**
```bash
# Verify env var is set
echo $TEST_AUTOMATION_SECRET

# Should match value in Vercel Dashboard
# Regenerate if needed: openssl rand -base64 32
```

### Test fails with "Test payer not configured"

**Issue:** `TEST_PAYER_PRIVATE_KEY` not set in Vercel

**Fix:**
1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Add `TEST_PAYER_PRIVATE_KEY` with base58-encoded private key
3. Redeploy or run locally with `.env.local`

### Test fails with "Insufficient balance"

**Issue:** Test wallet has no USDC

**Fix:**
```bash
# Get test payer address (see above)
# Send 1 USDC to that address from exchange/wallet
# This allows ~100 test runs
```

### Payment sent but status not updated

**Issue:** Helius webhook not configured

**Fix:**
1. Configure webhook at https://dev.helius.xyz
2. Set account address to merchant USDC ATA
3. Set auth header to `Bearer <HELIUS_WEBHOOK_SECRET>`
4. Verify webhook fires by checking Vercel logs

**Note:** Test will still PASS via fallback verification, but webhook is needed for production performance.

---

## Manual Testing (Alternative)

If you prefer to test without server automation:

### 1. Create Invoice

```bash
curl -X POST https://wino-business.vercel.app/api/invoices \
  -H 'Content-Type: application/json' \
  -d '{
    "recipient": "G7Jhr2df7tEYxmjcHTUJuGyourBDHYw2Zh46ms6NjRDJ",
    "amount": 0.01,
    "label": "Manual Test"
  }'
```

Copy the `solanaPayUrl` from response.

### 2. Pay with Mobile Wallet

1. Open Phantom/Solflare mobile app
2. Scan QR code or paste Solana Pay URL
3. Approve transaction

### 3. Verify Status

```bash
# Check invoice status
curl https://wino-business.vercel.app/api/invoices/INVOICE_ID

# Or trigger manual verification
curl -X POST https://wino-business.vercel.app/api/invoices/INVOICE_ID/verify
```

---

## Integration Testing Checklist

Before deploying to production, verify:

- [ ] Health endpoint returns healthy
- [ ] Invoice creation succeeds
- [ ] Invoice retrieval works (no 404)
- [ ] Test payment endpoint requires valid auth
- [ ] Test payment enforces amount limits
- [ ] Payment transaction includes reference
- [ ] Webhook detects payment (or fallback works)
- [ ] Invoice status updates to "paid"
- [ ] No secrets logged in Vercel logs

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Payment Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: E2E Payment Test
        env:
          TEST_AUTOMATION_SECRET: ${{ secrets.TEST_AUTOMATION_SECRET }}
          TEST_PAYER_PRIVATE_KEY: ${{ secrets.TEST_PAYER_PRIVATE_KEY }}
          API_BASE: https://wino-business.vercel.app
        run: npx tsx scripts/test-e2e-payment-server.ts
```

Add secrets in GitHub: Settings → Secrets and variables → Actions

---

## Test Wallet Management

### Creating a Test Wallet

```bash
# Generate new keypair
npx tsx -e "
  import { Keypair } from '@solana/web3.js';
  import bs58 from 'bs58';
  const kp = Keypair.generate();
  console.log('Address:', kp.publicKey.toBase58());
  console.log('Private Key (base58):', bs58.encode(kp.secretKey));
"

# Save private key to env vars
# Send 1 USDC to address for testing
```

### Monitoring Test Wallet

```bash
# Check balance
solana balance TEST_PAYER_ADDRESS

# Check USDC balance
spl-token balance --owner TEST_PAYER_ADDRESS EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

---

## Cost Analysis

**Per test run:**
- USDC amount: 0.01 USDC
- Solana transaction fee: ~0.000005 SOL
- Total cost: ~$0.01 + negligible fee

**100 test runs:**
- USDC: 1 USDC = ~$1.00
- SOL fees: ~0.0005 SOL = ~$0.05
- Total: ~$1.05

**Recommended:** Keep 1-2 USDC in test wallet for continuous testing.

---

## API Reference

### POST /api/test/pay-invoice

**Authorization:** `Bearer <TEST_AUTOMATION_SECRET>`

**Request:**
```json
{
  "invoiceId": "uuid-here"
}
```

**Response (Success):**
```json
{
  "ok": true,
  "invoiceId": "uuid-here",
  "signature": "5K8j..."
}
```

**Response (Error):**
```json
{
  "error": "Invoice not found"
}
```

**Status Codes:**
- 200: Success
- 400: Invalid request (amount > 0.05, wrong status, etc.)
- 401: Unauthorized
- 404: Invoice not found
- 500: Server error

---

## Best Practices

1. **Never commit secrets** - Use env vars and `.gitignore`
2. **Use test wallet only** - Separate from production funds
3. **Monitor test wallet balance** - Refill when low
4. **Run tests before deploy** - Catch issues early
5. **Check Vercel logs** - Verify no secrets logged
6. **Rotate secrets regularly** - Update TEST_AUTOMATION_SECRET periodically

---

## Support

- Production setup: See `PRODUCTION_SETUP.md`
- Implementation details: See `IMPLEMENTATION_SUMMARY.md`
- E2E test report: See `E2E_PAYMENT_TEST_REPORT.md`

---

**Last Updated:** 2026-01-01
