# Wino Business - Telegram Mini App

A full-featured Telegram Mini App for accepting crypto payments, managing invoices, and growing your business with blockchain technology on Solana.

## Features

- **Business Identity NFT**: Create and mint your business identity as an NFT on Solana
- **POS Mode**: Generate invoices with QR codes for customers to scan and pay
- **Payment Flow**: Scan merchant QR codes and complete payments
- **Real-time Status**: Track transaction status with blockchain confirmation
- **Transaction History**: View and filter past transactions
- **Light/Dark Theme**: Automatic theme switching based on Telegram settings

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI Components**: @telegram-apps/telegram-ui
- **Icons**: lucide-react
- **Blockchain**: Solana (@solana/web3.js)
- **Telegram SDK**: @twa-dev/sdk
- **Styling**: CSS Modules with CSS Variables

## Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── business-identity/        # Business identity flow
│   ├── connect-wallet/           # Wallet connection
│   ├── dashboard/                # Main dashboard
│   ├── importing/                # Wallet import loading
│   ├── pay/                      # Payment flow
│   ├── pos/                      # POS mode
│   └── welcome/                  # Onboarding
├── components/
│   ├── providers/                # React context providers
│   └── ui/                       # Reusable UI components
├── lib/                          # Utility functions
│   ├── nft.ts                    # NFT minting logic
│   ├── solana.ts                 # Solana connection
│   ├── storage.ts                # LocalStorage helpers
│   └── wallet-mock.ts            # Mock wallet adapter
├── styles/
│   └── globals.css               # Global styles & CSS variables
└── types/
    └── index.ts                  # TypeScript type definitions
```

## Routes

### Onboarding
- `/welcome` - Welcome screen
- `/connect-wallet` - Wallet connection
- `/importing` - Wallet import loading
- `/business-identity/name` - Enter business name
- `/business-identity/review` - Review business details
- `/business-identity/creating` - Minting NFT
- `/business-identity/success` - Success confirmation

### Main
- `/dashboard` - Main dashboard

### POS Mode
- `/pos` - POS home with transaction list
- `/pos/invoice/create` - Create new invoice
- `/pos/invoice/scan` - Display QR code for payment
- `/pos/invoice/pending` - Payment processing
- `/pos/invoice/success` - Payment successful
- `/pos/invoice/declined` - Payment declined

### Pay Flow
- `/pay/scan` - Scan merchant QR code
- `/pay/details` - Review payment details
- `/pay/pending` - Payment processing
- `/pay/success` - Payment successful
- `/pay/details-skeleton` - Loading skeleton

## Environment Variables

Create a `.env.local` file in the root directory. See `.env.example` for all options.

**Required for Production:**
```env
# Vercel Redis (REQUIRED for production - invoice persistence)
REDIS_URL=redis://default:your_password@your-redis.upstash.io:6379

# Helius Configuration (REQUIRED for webhooks)
HELIUS_API_KEY=your_helius_api_key_here
HELIUS_WEBHOOK_SECRET=your_random_secret_string_here
```

**Optional:**
```env
# Solana RPC (Fallback - Helius recommended)
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY

# Debug endpoint secret (for testing invoice status updates)
DEBUG_SECRET=your_debug_secret_here
```

### Setting up Vercel Redis

1. Go to your Vercel project dashboard
2. Navigate to **Storage** → **Create Database** → **Redis**
3. Once created, Vercel automatically adds `REDIS_URL` to your environment variables
4. Verify in **Settings** → **Environment Variables** that `REDIS_URL` is set
5. Redeploy your application

**IMPORTANT:** Vercel Redis is the single source of truth for all invoice data. Without it, invoice status updates will not persist in production.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

4. Build for production:
```bash
npm run build
```

5. Start production server:
```bash
npm start
```

## Helius Webhook Setup

This app uses Helius Enhanced Webhooks for real-time payment notifications. Follow these steps to set up webhooks:

### Prerequisites
1. Sign up for a Helius account at https://helius.dev
2. Get your API key from the Helius dashboard
3. Generate a secure random string for `HELIUS_WEBHOOK_SECRET` (e.g., `openssl rand -hex 32`)
4. Add both to your `.env.local` file

### Get Your Merchant USDC ATA

**CRITICAL**: Before configuring webhooks, you MUST get your merchant's USDC ATA (Associated Token Account):

```bash
npx tsx scripts/print-merchant-ata.ts
```

This will print both your merchant wallet address AND your USDC ATA. You'll need BOTH for webhook configuration.

### Option 1: Manual Setup via Helius Dashboard

1. Go to https://dev.helius.xyz/webhooks
2. Click "New Webhook"
3. Configure:
   - **Webhook URL**: `https://your-deployment.vercel.app/api/webhooks/helius`
   - **Webhook Type**: Enhanced
   - **Transaction Types**: ANY
   - **Account Addresses**: **BOTH** your merchant wallet AND merchant USDC ATA (from script above)
   - **Auth Header**: `Bearer YOUR_HELIUS_WEBHOOK_SECRET` (must match your env var)
4. Save the webhook

### Option 2: Automated Setup via Script

```bash
# Set environment variables
export HELIUS_API_KEY="your_helius_api_key"
export HELIUS_WEBHOOK_SECRET="your_webhook_secret"

# Run setup script
npx ts-node scripts/setup-helius-webhook.ts <merchantWallet> <deploymentUrl>

# Example:
npx ts-node scripts/setup-helius-webhook.ts 5nL8...xyz https://wino-business.vercel.app
```

### Webhook Verification

To verify webhooks are working:

1. Create an invoice in your deployed app
2. Pay it with a test transaction
3. Check your Helius webhook dashboard for delivery logs
4. Check your app logs for webhook processing

### Important Notes

- **Authorization**: The webhook endpoint requires `Authorization: Bearer <HELIUS_WEBHOOK_SECRET>` header
- **Enhanced Webhooks**: Provides detailed transaction data including token transfers
- **ATA Requirement**: Webhook MUST watch the merchant USDC ATA (not just wallet) to reliably trigger on token transfers
- **Micro-Decimal Matching**: Payments are matched by exact amount with unique micro-decimals (e.g., 1.000123 USDC)
  - Each invoice gets a unique random micro-decimal added (0.000001-0.000999)
  - Works with ALL wallets, including those that don't support Solana Pay reference/memo (e.g., Trust Wallet)
  - 10-minute expiry window prevents collisions and stale matches
- **RECEIVE-ONLY**: Merchant app only receives payments, never sends funds out
- **Real-time Updates**: Server-Sent Events (SSE) provide instant UI updates when payments are confirmed

### Testing Invoice Status Updates

To verify that the webhook → Redis integration is working correctly:

1. **Create a test invoice:**
   ```bash
   curl -X POST https://your-app.vercel.app/api/invoices \
     -H "Content-Type: application/json" \
     -d '{
       "recipient": "G7Jhr2df7tEYxmjcHTUJuGyourBDHYw2Zh46ms6NjRDJ",
       "amount": 1.50,
       "label": "Test Invoice"
     }'
   ```
   Save the returned `invoiceId`.

2. **Mark invoice as paid (using debug endpoint):**
   ```bash
   curl -X POST https://your-app.vercel.app/api/debug/mark-paid \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_DEBUG_SECRET" \
     -d '{"invoiceId": "YOUR_INVOICE_ID"}'
   ```

3. **Verify status in UI:**
   - Open the invoice in your app
   - Status should show as "PAID"
   - This confirms Redis is working correctly

### Troubleshooting

**Webhook not receiving events:**
- Verify BOTH merchant wallet AND USDC ATA are in webhook "accountAddresses"
- Run `npx tsx scripts/print-merchant-ata.ts` to verify correct ATA address
- Check that webhook URL is publicly accessible (not localhost)
- Verify `HELIUS_WEBHOOK_SECRET` matches in webhook config and `.env.local`

**Payment not detected:**
- Check webhook delivery logs in Helius dashboard
- Verify transaction includes memo `wino:<invoiceId>` (check server logs)
- For fallback matching: payment must be made within 30 minutes of invoice creation
- Check server logs for detailed matching information (shows memo, ATA, amount checks)

**Invoice status not updating:**
- Verify Vercel Redis is properly configured (check environment variables)
- Check Vercel function logs for errors
- Use debug endpoint to test Redis write access
- Ensure `REDIS_URL` is set correctly in Vercel environment variables

## Theme Support

The app supports light and dark themes:
- Automatically follows Telegram Mini App color scheme
- Falls back to system `prefers-color-scheme`
- Dev mode: Press `Ctrl+T` to toggle theme manually

## Telegram Mini App Integration

The app uses `@twa-dev/sdk` for Telegram integration:
- Safe area insets for proper spacing
- Theme color scheme detection
- User data access
- Closing confirmation

## Mock Wallet Adapter

The app includes a mock wallet adapter for development and testing without requiring actual wallet extensions. This allows the app to function fully without Phantom or Solflare installed.

For production, you can integrate real wallet adapters by:
1. Installing `@solana/wallet-adapter-wallets`
2. Replacing the mock implementation in `src/lib/wallet-mock.ts`
3. Updating `src/components/providers/WalletProvider.tsx`

## NFT Minting

Business identities are minted as NFTs on Solana. The current implementation uses a mock minting function. To enable real NFT minting:

1. Install Metaplex: `npm install @metaplex-foundation/js`
2. Update the `mintBusinessNFT` function in `src/lib/nft.ts`
3. Configure metadata storage (Arweave, IPFS, etc.)

## License

MIT
