# Wino Business - Production Setup Guide

## Overview

Wino Business is a RECEIVE-ONLY Solana Pay merchant application that processes USDC payments on mainnet. This guide covers the complete production setup on Vercel.

## Architecture

**Payment Detection Flow:**
1. Merchant creates invoice via `/api/invoices` (generates unique reference key)
2. Customer scans Solana Pay QR code and sends USDC
3. Helius webhook detects transaction and matches by reference key (PRIMARY)
4. Invoice status updated to "paid" in real-time
5. Client polling sees status change OR client can trigger `/api/invoices/:id/verify` for immediate on-chain verification (FALLBACK)

**Key Features:**
- ✅ Reference-based invoice matching (robust, deterministic)
- ✅ Helius webhook for near-instant updates
- ✅ On-chain verification fallback via `@solana/pay`
- ✅ Vercel KV or Redis for persistence
- ✅ Health monitoring endpoint
- ✅ Comprehensive logging

---

## Required Environment Variables

### 1. Storage (Choose ONE):

#### Option A: Vercel KV (Recommended)
```bash
KV_REST_API_URL=https://your-kv-instance.upstash.io
KV_REST_API_TOKEN=your-kv-token
```

**Setup:**
1. Go to Vercel Dashboard → Storage → Create Database → KV
2. Copy the REST API credentials
3. Add to your project's Environment Variables

#### Option B: Upstash Redis
```bash
REDIS_URL=redis://default:password@host:port
```

**Setup:**
1. Create account at https://upstash.com
2. Create Redis database
3. Copy the Redis URL
4. Add to Vercel Environment Variables

---

### 2. Helius Webhook (REQUIRED)

```bash
HELIUS_WEBHOOK_SECRET=your-random-secret-string-here
```

**Setup:**
1. Generate a secure random secret:
   ```bash
   openssl rand -base64 32
   ```

2. Add to Vercel Environment Variables

3. Configure Helius webhook:
   - Go to https://dev.helius.xyz/dashboard/webhooks
   - Create new webhook with:
     - **Webhook URL:** `https://your-app.vercel.app/api/webhooks/helius`
     - **Webhook Type:** Enhanced Transactions
     - **Account Addresses:** Add your merchant's USDC ATA address
       (You can find this by running `npm run scripts/print-merchant-ata.ts`)
     - **Transaction Types:** Select "Any"
     - **Authorization Header:** `Bearer your-random-secret-string-here`

---

### 3. Solana Configuration

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# OR use Helius RPC for better performance:
# SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY

NEXT_PUBLIC_MERCHANT_WALLET=G7Jhr2df7tEYxmjcHTUJuGyourBDHYw2Zh46ms6NjRDJ
```

**Note:** The merchant wallet is the RECEIVE-ONLY address that accepts USDC payments.

---

### 4. Optional (for debugging)

```bash
DEBUG_SECRET=your-debug-secret
```

---

## Complete Setup Checklist

### 1. Vercel Project Setup

```bash
# Clone and deploy
git clone <your-repo>
cd wino-business
npm install
vercel deploy --prod
```

### 2. Configure Environment Variables

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

Add ALL required variables above (at minimum: storage + HELIUS_WEBHOOK_SECRET + merchant wallet)

### 3. Set Up Helius Webhook

1. Get your merchant's USDC ATA:
   ```bash
   npx tsx scripts/print-merchant-ata.ts
   ```

2. Create webhook at https://dev.helius.xyz with:
   - URL: `https://your-app.vercel.app/api/webhooks/helius`
   - Account: Your merchant USDC ATA
   - Auth header: `Bearer <your-secret>`

### 4. Verify Health

```bash
curl https://your-app.vercel.app/api/health
```

Should return:
```json
{
  "status": "healthy",
  "checks": {
    "storage": { "ok": true },
    "environment": { ... }
  }
}
```

### 5. Test Invoice Creation

```bash
# Create test invoice
curl -X POST https://your-app.vercel.app/api/invoices \
  -H 'Content-Type: application/json' \
  -d '{
    "recipient": "YOUR_MERCHANT_WALLET",
    "amount": 0.01,
    "allowCustomAmount": false,
    "label": "Test Payment"
  }'
```

Should return:
```json
{
  "invoiceId": "uuid-here",
  "solanaPayUrl": "solana:...",
  "referencePubkey": "...",
  "merchantUsdcAta": "...",
  "amountUsd": 0.01
}
```

### 6. Verify Invoice Retrieval

```bash
curl https://your-app.vercel.app/api/invoices/<invoice-id>
```

Should return invoice object (NOT 404!)

### 7. Test E2E Payment

```bash
# Run test payment script
npx tsx scripts/test-e2e-payment.ts
```

This will:
1. Create invoice
2. Send real USDC payment on mainnet
3. Monitor webhook and status updates
4. Report success/failure

---

## Monitoring & Debugging

### Health Check
```bash
curl https://your-app.vercel.app/api/health
```

### View Logs
Go to Vercel Dashboard → Your Project → Deployments → [Latest] → View Function Logs

Look for:
- `[invoicesStore]` - Invoice creation and updates
- `[webhook]` - Webhook processing
- `[verify]` - On-chain verification

### Common Issues

**Issue: Invoice returns 404 after creation**
- **Cause:** Storage not configured
- **Fix:** Add KV_REST_API_URL + KV_REST_API_TOKEN or REDIS_URL

**Issue: Payment not detected**
- **Cause:** Helius webhook not configured or wrong account address
- **Fix:** Verify webhook is set up with correct USDC ATA and auth header

**Issue: Webhook returns 401**
- **Cause:** Authorization header mismatch
- **Fix:** Ensure webhook auth header is `Bearer <HELIUS_WEBHOOK_SECRET>`

---

## API Endpoints

### Health Check
```
GET /api/health
```

### Create Invoice
```
POST /api/invoices
Content-Type: application/json

{
  "recipient": "merchant-wallet-pubkey",
  "amount": 1.00,
  "allowCustomAmount": false,
  "label": "Product Name",
  "message": "Payment for..."
}
```

### Get Invoice
```
GET /api/invoices/:id
```

### Verify Invoice (Fallback)
```
POST /api/invoices/:id/verify
```

Forces on-chain verification using reference lookup.

### Webhook (Helius)
```
POST /api/webhooks/helius
Authorization: Bearer <secret>
```

---

## Security Best Practices

1. **Webhook Secret:** Use a strong random secret (32+ characters)
2. **Merchant Wallet:** NEVER deploy private key to Vercel (RECEIVE-ONLY means no private key needed!)
3. **Environment Variables:** Set as "Production" only in Vercel
4. **Rate Limiting:** Consider adding rate limiting to public endpoints

---

## Performance Tips

1. Use Vercel KV for best serverless performance
2. Use Helius RPC for faster on-chain queries
3. Monitor function execution times in Vercel logs
4. Consider caching invoice data on client side

---

## Support

- Vercel Docs: https://vercel.com/docs
- Helius Docs: https://docs.helius.dev
- Solana Pay Spec: https://docs.solanapay.com

---

## Testing Checklist

- [ ] Health endpoint returns healthy
- [ ] Invoice creation succeeds (not 500)
- [ ] Invoice retrieval succeeds (not 404)
- [ ] Webhook GET returns friendly message
- [ ] Webhook POST with valid auth returns 200
- [ ] Real payment detected and invoice updated
- [ ] Verify endpoint works for unpaid invoice
- [ ] Verify endpoint returns cached result for paid invoice
