# Fund Test Wallet - Quick Guide

## Test Wallet Address
```
HwiirurS8Yr28AFiW97f4JNVFZawcN74WrjQToPxmmjY
```

## What to Send

### Option A: Minimum (10 test runs)
- **0.01 SOL** - For transaction fees (~$0.50)
- **0.1 USDC** - For test payments (~$0.10)
- **Total cost:** ~$0.60

### Option B: Recommended (100 test runs)
- **0.05 SOL** - For transaction fees (~$2.50)
- **1 USDC** - For test payments (~$1.00)
- **Total cost:** ~$3.50

---

## How to Send

### From Coinbase:

1. **Send SOL:**
   - Go to Coinbase → Send
   - Asset: SOL (Solana)
   - Amount: 0.05 SOL
   - To: `HwiirurS8Yr28AFiW97f4JNVFZawcN74WrjQToPxmmjY`
   - **Important:** Use Solana network (not ERC-20)

2. **Send USDC:**
   - Go to Coinbase → Send
   - Asset: USDC
   - Amount: 1 USDC
   - To: `HwiirurS8Yr28AFiW97f4JNVFZawcN74WrjQToPxmmjY`
   - **Important:** Select "Solana" network (SPL token)

### From Phantom/Solflare Wallet:

1. Open wallet app
2. Select "Send"
3. Enter address: `HwiirurS8Yr28AFiW97f4JNVFZawcN74WrjQToPxmmjY`
4. Choose asset (SOL, then USDC)
5. Enter amount and confirm

### From Binance/Other Exchange:

1. Withdraw → Solana (SOL)
2. Network: Solana mainnet
3. Address: `HwiirurS8Yr28AFiW97f4JNVFZawcN74WrjQToPxmmjY`
4. Amount: 0.05 SOL
5. Repeat for USDC (ensure "Solana" network selected)

---

## Verify Funds Arrived

Run this command to check balance:

```bash
npx tsx scripts/check-test-wallet.ts
```

Or check on Solscan:
https://solscan.io/account/HwiirurS8Yr28AFiW97f4JNVFZawcN74WrjQToPxmmjY

---

## After Funding

Once you see the funds, run the E2E test:

```bash
TEST_AUTOMATION_SECRET="mj/fu42MkNX4gNXLa8ObCX/2RWT1IJc2Yb8m4Te4rP4=" \
  npx tsx scripts/test-e2e-payment-server.ts
```

---

## Cost Breakdown

**Per Test Run:**
- USDC payment: 0.01 USDC
- SOL fee: ~0.000005 SOL
- Total: ~$0.01

**With 1 USDC + 0.05 SOL:**
- ~100 test runs possible
- Total cost: ~$3.50
- Cost per test: ~$0.035

---

## Security Note

This wallet is for TESTING ONLY:
- Private key is in Vercel environment variables
- Only used for automated E2E tests
- Amount limits enforced (max 0.05 USDC per test)
- Never use for production funds
