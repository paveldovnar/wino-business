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

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
```

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
