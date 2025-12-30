'use client';

import { ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
import { clusterApiUrl } from '@solana/web3.js';

export function WalletProvider({ children }: { children: ReactNode }) {
  // Use mainnet-beta as specified in requirements
  const endpoint = useMemo(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    return rpcUrl || clusterApiUrl('mainnet-beta');
  }, []);

  // Configure WalletConnect adapter with project ID
  const wallets = useMemo(
    () => [
      new WalletConnectWalletAdapter({
        network: 'mainnet-beta' as any,
        options: {
          projectId: 'bf22e397164491caa066ada6d64c6756',
          metadata: {
            name: 'Wino Business',
            description: 'Telegram Mini App for business payments',
            url: typeof window !== 'undefined' ? window.location.origin : 'https://wino.business',
            icons: [typeof window !== 'undefined' ? `${window.location.origin}/icon.png` : 'https://wino.business/icon.png'],
          },
        },
      }),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
