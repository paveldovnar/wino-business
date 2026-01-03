'use client';

import { ReactNode, useMemo, useCallback, useEffect, useState } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
import { clusterApiUrl } from '@solana/web3.js';
import { saveWalletState, getWalletState, clearWalletState } from '@/lib/wallet-persistence';

// Inner component that handles wallet state persistence
function WalletPersistenceHandler({ children }: { children: ReactNode }) {
  const { connected, publicKey, connecting, disconnect } = useWallet();
  const [hasCheckedSession, setHasCheckedSession] = useState(false);

  // Save wallet state when connected
  useEffect(() => {
    if (connected && publicKey) {
      console.log('[WalletProvider] Saving wallet state:', publicKey.toBase58().slice(0, 8) + '...');
      saveWalletState({
        wasConnected: true,
        lastAddress: publicKey.toBase58(),
        lastConnectedAt: Date.now(),
      });
    }
  }, [connected, publicKey]);

  // Clear wallet state on explicit disconnect (not page reload)
  useEffect(() => {
    if (!connected && !connecting && hasCheckedSession) {
      // Only clear if we previously had a session and now we don't
      const previousState = getWalletState();
      if (previousState?.wasConnected) {
        // Check if this is a timeout vs explicit disconnect
        const timeSinceConnect = Date.now() - previousState.lastConnectedAt;
        // If very recent (< 5 seconds), might be a reload - don't clear
        if (timeSinceConnect > 5000) {
          console.log('[WalletProvider] Session lost after', Math.round(timeSinceConnect / 1000), 'seconds');
        }
      }
    }
    setHasCheckedSession(true);
  }, [connected, connecting, hasCheckedSession]);

  return <>{children}</>;
}

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

  // Error handler for wallet errors
  const onError = useCallback((error: Error) => {
    console.error('[WalletProvider] Wallet error:', error.message);
    // Don't clear state on transient errors
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect={true} onError={onError}>
        <WalletPersistenceHandler>
          {children}
        </WalletPersistenceHandler>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
