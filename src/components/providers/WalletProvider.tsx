'use client';

import { ReactNode, useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
import { clusterApiUrl } from '@solana/web3.js';
import { saveWalletState, getWalletState, clearWalletState, shouldExpectReconnect, fullWalletLogout } from '@/lib/wallet-persistence';

// Timeout for wallet session restoration (10 seconds)
const SESSION_RESTORE_TIMEOUT_MS = 10000;

// Inner component that handles wallet state persistence and timeout
function WalletPersistenceHandler({ children }: { children: ReactNode }) {
  const { connected, publicKey, connecting, disconnect, wallet } = useWallet();
  const [hasCheckedSession, setHasCheckedSession] = useState(false);
  const [restoreTimedOut, setRestoreTimedOut] = useState(false);
  const connectingStartRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debug logging in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[WalletProvider] State:', {
        connected,
        connecting,
        publicKey: publicKey?.toBase58()?.slice(0, 8) || null,
        walletRestoring: connecting && !connected,
        restoreTimedOut,
      });
    }
  }, [connected, connecting, publicKey, restoreTimedOut]);

  // Handle connecting timeout - prevent "connecting forever"
  useEffect(() => {
    if (connecting && !connected) {
      // Started connecting
      if (!connectingStartRef.current) {
        connectingStartRef.current = Date.now();
        console.log('[WalletProvider] Connection attempt started');

        // Set timeout to force-end connecting state
        timeoutRef.current = setTimeout(() => {
          if (connecting && !connected) {
            console.warn('[WalletProvider] Connection timeout reached, forcing disconnect');
            setRestoreTimedOut(true);
            connectingStartRef.current = null;

            // Force disconnect and clear state
            try {
              disconnect();
            } catch (e) {
              console.warn('[WalletProvider] Disconnect during timeout failed:', e);
            }

            // Clear wallet state to prevent infinite retry
            clearWalletState();
          }
        }, SESSION_RESTORE_TIMEOUT_MS);
      }
    } else {
      // No longer connecting - clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      connectingStartRef.current = null;

      if (connected && publicKey) {
        setRestoreTimedOut(false);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [connecting, connected, publicKey, disconnect]);

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

  // Mark session as checked
  useEffect(() => {
    if (!hasCheckedSession) {
      // Give a brief moment for auto-connect to kick in
      const timer = setTimeout(() => {
        setHasCheckedSession(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasCheckedSession]);

  return <>{children}</>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  // Use devnet for identity PDA testing
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet') as 'devnet' | 'mainnet-beta';
  const endpoint = useMemo(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    return rpcUrl || clusterApiUrl(cluster);
  }, [cluster]);

  // Configure WalletConnect adapter with project ID
  const wallets = useMemo(
    () => [
      new WalletConnectWalletAdapter({
        network: cluster as any,
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
    [cluster]
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
