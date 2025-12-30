// This file now exports real wallet functionality from @solana/wallet-adapter-react
// Keeping the filename for backwards compatibility with existing imports

export {
  useWallet,
  useConnection,
  type WalletContextState,
  type ConnectionContextState,
} from '@solana/wallet-adapter-react';

// Note: The WalletContext and ConnectionContext are now provided by @solana/wallet-adapter-react
// They are wrapped in our WalletProvider component located at:
// src/components/providers/WalletProvider.tsx
//
// Real wallet connection flow:
// 1. User clicks connect button
// 2. WalletConnect modal opens
// 3. User scans QR code with mobile wallet (Phantom, Solflare, etc.)
// 4. Wallet approves connection
// 5. publicKey is available via useWallet().publicKey
//
// Future integration points:
// - signTransaction: Will be used when minting the business identity NFT
// - signMessage: Can be used for authentication/verification
// - signAllTransactions: For batched operations if needed
