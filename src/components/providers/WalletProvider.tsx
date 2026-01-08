'use client';

import { ReactNode, useMemo, useCallback, useEffect, useState, useRef, createContext, useContext } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
import { clusterApiUrl } from '@solana/web3.js';
import { saveWalletState, getWalletState, clearWalletState, shouldExpectReconnect, fullWalletLogout } from '@/lib/wallet-persistence';

// Timeout for wallet session restoration (10 seconds)
const SESSION_RESTORE_TIMEOUT_MS = 10000;

/**
 * WALLETCONNECT FIX DIAGNOSIS:
 *
 * Problem 1: projectId was hardcoded - now reads from NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
 * Problem 2: No error UI when projectId missing - now exposed via WalletConfigContext
 * Problem 3: metadata.url could be wrong in production - now uses runtime origin detection
 * Problem 4: Session restore could hang forever - timeout mechanism in WalletPersistenceHandler
 *
 * The WalletConnect adapter is created once on mount and should not be recreated on
 * every render. The useMemo dependency array includes cluster to recreate only when
 * network changes.
 */

// Context to expose wallet configuration status to UI components
interface WalletConfigContextType {
  projectIdMissing: boolean;
  projectId: string | null;
}

const WalletConfigContext = createContext<WalletConfigContextType>({
  projectIdMissing: false,
  projectId: null,
});

export function useWalletConfig() {
  return useContext(WalletConfigContext);
}

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

// USDC mainnet mint address
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Fallback projectId if env var not set (the original hardcoded one)
const FALLBACK_PROJECT_ID = 'bf22e397164491caa066ada6d64c6756';

/**
 * Detect if running in Telegram WebView
 */
function isTelegramWebView(): boolean {
  if (typeof window === 'undefined') return false;
  // Check for Telegram WebApp API
  if ((window as any).Telegram?.WebApp) return true;
  // Check userAgent patterns
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('telegram') || ua.includes('tgweb');
}

/**
 * Get the correct origin URL for WalletConnect metadata
 * Handles Telegram WebView and Vercel deployments
 */
function getMetadataUrl(): string {
  if (typeof window === 'undefined') {
    // SSR fallback - use VERCEL_URL or default
    const vercelUrl = process.env.VERCEL_URL;
    if (vercelUrl) return `https://${vercelUrl}`;
    return 'https://wino.business';
  }

  // In Telegram WebView, window.location.origin might be different
  // Always use the actual origin for WalletConnect
  return window.location.origin;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  // Default to mainnet-beta (production)
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'mainnet-beta') as 'devnet' | 'mainnet-beta';

  // Get projectId from env var with fallback
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || FALLBACK_PROJECT_ID;
  const projectIdMissing = !process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

  // Log warning if using fallback
  useEffect(() => {
    if (projectIdMissing) {
      console.warn('[WalletProvider] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID not set, using fallback projectId');
    }
  }, [projectIdMissing]);

  const endpoint = useMemo(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    const finalEndpoint = rpcUrl || clusterApiUrl(cluster);

    // Log network configuration at startup
    console.log(`[network] Using ${cluster} RPC=${finalEndpoint.slice(0, 50)}... USDC=${USDC_MINT}`);

    return finalEndpoint;
  }, [cluster]);

  // Configure WalletConnect adapter with project ID from env
  const wallets = useMemo(
    () => {
      const metadataUrl = getMetadataUrl();
      const inTelegram = isTelegramWebView();

      console.log('[WalletProvider] Creating WalletConnect adapter:', {
        projectId: projectId.slice(0, 8) + '...',
        cluster,
        metadataUrl,
        inTelegram,
      });

      return [
        new WalletConnectWalletAdapter({
          network: cluster as any,
          options: {
            projectId,
            metadata: {
              name: 'Wino Business',
              description: 'Receive-only merchant app',
              url: metadataUrl,
              icons: [`${metadataUrl}/icon.png`],
            },
          },
        }),
      ];
    },
    [cluster, projectId]
  );

  // Error handler for wallet errors
  const onError = useCallback((error: Error) => {
    console.error('[WalletProvider] Wallet error:', error.message);
    // Don't clear state on transient errors
  }, []);

  // Config context value
  const configValue = useMemo(() => ({
    projectIdMissing,
    projectId,
  }), [projectIdMissing, projectId]);

  return (
    <WalletConfigContext.Provider value={configValue}>
      <ConnectionProvider endpoint={endpoint}>
        <SolanaWalletProvider wallets={wallets} autoConnect={true} onError={onError}>
          <WalletPersistenceHandler>
            {children}
          </WalletPersistenceHandler>
        </SolanaWalletProvider>
      </ConnectionProvider>
    </WalletConfigContext.Provider>
  );
}
